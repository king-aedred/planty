import { httpAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { authenticateDevice, jsonResponse, parseDeviceBearer, sanitizeDeviceConfig } from "./devices";

// Befehlskanal Backend -> Gerät nach Vertrag Firmware v7 Abschnitt 6.
// - Ein Befehl bleibt abholbar (pending oder delivered), bis das Gerät ihn quittiert oder er abläuft.
//   Wiederholtes Abholen liefert ihn erneut aus; die Firmware führt Befehle nach id idempotent aus.
// - Pro Gerät und Typ höchstens ein offener Befehl: ein neuer ersetzt den alten (expired, detail "replaced").
// - WLAN-Passwort (set_wifi): nur in GET /device/commands an das authentifizierte Gerät. Gelöscht bei
//   Ack (ok/failed), Ablauf, Ersetzen und Freigabe des Sensors. Nie loggen, nie an die App zurückgeben.

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const SET_WIFI_TTL_MS = 10 * 60 * 1000;
const MAX_SSID_BYTES = 32;
const MAX_PASSWORD_BYTES = 64;
const MAX_DETAIL_LENGTH = 200;
// Befehls-id: "c_" + Convex-Id (derzeit 32 Zeichen), insgesamt höchstens 48 Zeichen.
const COMMAND_ID_PATTERN = /^c_[a-z0-9]{1,46}$/;
const MAX_COMMANDS_PER_RESPONSE = 10;

type CommandType = Doc<"device_commands">["type"];
type CommandParams = Doc<"device_commands">["params"];
type OpenStatus = "pending" | "delivered";

const OPEN_STATUSES: OpenStatus[] = ["pending", "delivered"];

const byteLength = (value: string) => new TextEncoder().encode(value).length;

const withoutPassword = (params: CommandParams): CommandParams => {
  const { password: _password, ...rest } = params;
  return rest;
};

// Grenzen in Bytes (UTF-8), weil WLAN-SSID und -Passwort byteweise begrenzt sind.
const assertValidWifi = (ssid: string, password: string) => {
  const ssidBytes = byteLength(ssid);
  if (ssidBytes < 1 || ssidBytes > MAX_SSID_BYTES || byteLength(password) > MAX_PASSWORD_BYTES) {
    throw new Error("Invalid Wi-Fi credentials");
  }
};

// Status für App und Admin-Abfrage. Nie mit Passwort.
const toCommandStatus = (command: Doc<"device_commands">) => ({
  command_id: command.command_id,
  device_id: command.device_id,
  type: command.type,
  params: withoutPassword(command.params),
  status:
    command.expires_at <= Date.now() && (command.status === "pending" || command.status === "delivered")
      ? ("expired" as const)
      : command.status,
  created_at: command.created_at,
  expires_at: command.expires_at,
  delivered_at: command.delivered_at ?? null,
  acked_at: command.acked_at ?? null,
  detail: command.detail ?? null,
});

// Offene, noch nicht abgelaufene Befehle eines Geräts, älteste zuerst.
const getOpenCommands = async (ctx: QueryCtx | MutationCtx, deviceId: string, now: number) => {
  const commands: Doc<"device_commands">[] = [];
  for (const status of OPEN_STATUSES) {
    const rows = await ctx.db
      .query("device_commands")
      .withIndex("by_device_and_status", (q) => q.eq("device_id", deviceId).eq("status", status))
      .collect();
    commands.push(...rows);
  }
  return commands.filter((command) => command.expires_at > now).sort((left, right) => left.created_at - right.created_at);
};

export const hasOpenCommands = async (ctx: QueryCtx | MutationCtx, deviceId: string, now: number) =>
  (await getOpenCommands(ctx, deviceId, now)).length > 0;

// Schließt einen offenen Befehl ab, ohne dass das Gerät ihn quittiert hat, und löscht das Passwort.
const closeCommand = async (ctx: MutationCtx, command: Doc<"device_commands">, detail: string) => {
  await ctx.db.patch(command._id, {
    status: "expired",
    detail,
    params: withoutPassword(command.params),
  });
};

const createCommand = async (
  ctx: MutationCtx,
  args: { device_id: string; type: CommandType; params: CommandParams; created_by?: string },
) => {
  const now = Date.now();

  // Ein neuer Befehl ersetzt einen offenen Befehl desselben Typs.
  for (const status of OPEN_STATUSES) {
    const open = await ctx.db
      .query("device_commands")
      .withIndex("by_device_and_status", (q) => q.eq("device_id", args.device_id).eq("status", status))
      .collect();
    for (const command of open.filter((entry) => entry.type === args.type)) {
      await closeCommand(ctx, command, "replaced");
    }
  }

  const expiresAt = now + (args.type === "set_wifi" ? SET_WIFI_TTL_MS : DEFAULT_TTL_MS);
  const docId = await ctx.db.insert("device_commands", {
    command_id: "",
    device_id: args.device_id,
    type: args.type,
    params: args.params,
    status: "pending",
    created_at: now,
    expires_at: expiresAt,
    created_by: args.created_by,
  });
  // Die Convex-Id ist eindeutig und besteht nur aus Kleinbuchstaben und Ziffern.
  const commandId = `c_${docId}`;
  if (!COMMAND_ID_PATTERN.test(commandId)) {
    // Schutz für den 48-Zeichen-Puffer der Firmware, falls sich das Format der Convex-Ids ändert.
    throw new Error("Command id exceeds 48 characters");
  }
  await ctx.db.patch(docId, { command_id: commandId });

  // Ablauf zum Ablaufzeitpunkt, löscht dabei auch das Passwort.
  await ctx.scheduler.runAt(expiresAt, internal.device_commands.expireCommand, { command_doc_id: docId });

  return { command_id: commandId, expires_at: expiresAt };
};

export const expireCommand = internalMutation({
  args: { command_doc_id: v.id("device_commands") },
  handler: async (ctx, args) => {
    const command = await ctx.db.get(args.command_doc_id);
    if (!command) return;
    if (command.status === "pending" || command.status === "delivered") {
      await closeCommand(ctx, command, "expired");
    } else if (command.params.password !== undefined) {
      await ctx.db.patch(command._id, { params: withoutPassword(command.params) });
    }
  },
});

// Gibt einen Sensor frei: Besitz und Pflanzen lösen, device_token_hash entfernen (Gerät bekommt beim
// nächsten Kontakt 401 und fällt in NICHT ZUGEORDNET), offene Befehle schließen. Kein unclaim-Befehl.
export const releaseSensor = async (ctx: MutationCtx, sensor: Doc<"sensors">, reason: string) => {
  const previousOwner = sensor.clerk_id;

  await ctx.db.patch(sensor._id, {
    clerk_id: undefined,
    claimed_at: undefined,
    device_token_hash: undefined,
    // v6-Geräte erfahren die Freigabe weiter über /hello.
    reset_requested: true,
  });

  if (previousOwner) {
    const plantsByDevice = await ctx.db
      .query("plants")
      .withIndex("by_device_id", (q) => q.eq("device_id", sensor.device_id))
      .collect();
    const plantsBySensor = await ctx.db
      .query("plants")
      .withIndex("by_sensor_id", (q) => q.eq("sensor_id", sensor.device_id))
      .collect();
    const plants = [...plantsByDevice, ...plantsBySensor].filter(
      (plant, index, all) => plant.clerk_id === previousOwner && all.findIndex((other) => other._id === plant._id) === index,
    );
    for (const plant of plants) {
      await ctx.db.patch(plant._id, { device_id: undefined, sensor_id: undefined });
    }
  }

  // Auch zeitlich schon abgelaufene, aber noch offene Befehle schließen (Passwort löschen).
  for (const command of await getOpenCommands(ctx, sensor.device_id, Number.NEGATIVE_INFINITY)) {
    await closeCommand(ctx, command, reason);
  }
};

const requireOwnedSensor = async (ctx: QueryCtx | MutationCtx, deviceId: string) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }
  const sensor = await ctx.db
    .query("sensors")
    .withIndex("by_device_id", (q) => q.eq("device_id", deviceId))
    .first();
  if (!sensor || sensor.clerk_id !== identity.subject) {
    throw new Error("Unauthorized");
  }
  return { sensor, clerkId: identity.subject };
};

// --- Öffentliche Funktionen für die App (Clerk, nur Besitzer des Sensors) ---

export const requestMeasureNow = mutation({
  args: { device_id: v.string() },
  handler: async (ctx, args) => {
    const { clerkId } = await requireOwnedSensor(ctx, args.device_id);
    return await createCommand(ctx, { device_id: args.device_id, type: "measure_now", params: {}, created_by: clerkId });
  },
});

export const requestOtaNow = mutation({
  args: { device_id: v.string() },
  handler: async (ctx, args) => {
    const { clerkId } = await requireOwnedSensor(ctx, args.device_id);
    return await createCommand(ctx, { device_id: args.device_id, type: "ota_now", params: {}, created_by: clerkId });
  },
});

export const requestFactoryReset = mutation({
  args: { device_id: v.string() },
  handler: async (ctx, args) => {
    const { clerkId } = await requireOwnedSensor(ctx, args.device_id);
    return await createCommand(ctx, { device_id: args.device_id, type: "factory_reset", params: {}, created_by: clerkId });
  },
});

export const requestSetWifi = mutation({
  args: { device_id: v.string(), ssid: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const { clerkId } = await requireOwnedSensor(ctx, args.device_id);
    assertValidWifi(args.ssid, args.password);
    // Rückgabe ohne Passwort.
    return await createCommand(ctx, {
      device_id: args.device_id,
      type: "set_wifi",
      params: { ssid: args.ssid, password: args.password },
      created_by: clerkId,
    });
  },
});

export const getCommandStatus = query({
  args: { command_id: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    const command = await ctx.db
      .query("device_commands")
      .withIndex("by_command_id", (q) => q.eq("command_id", args.command_id))
      .first();
    if (!command) return null;

    const sensor = await ctx.db
      .query("sensors")
      .withIndex("by_device_id", (q) => q.eq("device_id", command.device_id))
      .first();
    if (sensor?.clerk_id !== identity.subject && command.created_by !== identity.subject) {
      return null;
    }

    return toCommandStatus(command);
  },
});

export const removeSensor = mutation({
  args: { device_id: v.string() },
  handler: async (ctx, args) => {
    const { sensor } = await requireOwnedSensor(ctx, args.device_id);
    await releaseSensor(ctx, sensor, "sensor_removed");
    return { ok: true } as const;
  },
});

// set_config ist kein App-Befehl: per Convex-Dashboard oder `npx convex run` auslösen.
// Aktualisiert zusätzlich sensors.config, damit Claim und Batch dieselbe Konfiguration liefern.
export const requestSetConfig = internalMutation({
  args: {
    device_id: v.string(),
    config: v.object({
      settle_ms: v.optional(v.number()),
      samples: v.optional(v.number()),
      low_battery_v: v.optional(v.number()),
      critical_battery_v: v.optional(v.number()),
      online_poll_s: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => await enqueueSetConfig(ctx, args.device_id, args.config),
});

const enqueueSetConfig = async (ctx: MutationCtx, deviceId: string, config: Record<string, unknown>) => {
  const sensor = await ctx.db
    .query("sensors")
    .withIndex("by_device_id", (q) => q.eq("device_id", deviceId))
    .first();
  if (!sensor) {
    throw new Error("Sensor not found");
  }
  const merged = sanitizeDeviceConfig({ ...(sensor.config ?? {}), ...config });
  const requested = sanitizeDeviceConfig(config);
  // Nur Felder schicken, die angefragt und nach dem Zusammenführen gültig sind.
  const params = Object.fromEntries(
    Object.keys(requested)
      .filter((field) => field in merged)
      .map((field) => [field, merged[field as keyof typeof merged]]),
  ) as CommandParams;
  if (Object.keys(params).length === 0) {
    throw new Error("No valid config fields");
  }
  await ctx.db.patch(sensor._id, { config: merged });
  return await createCommand(ctx, { device_id: deviceId, type: "set_config", params });
};

// --- NUR ZUM TESTEN (ohne Clerk-Login) ---
// Interne Funktionen, nicht öffentlich: nur mit Admin-Zugang per `npx convex run` oder im Dashboard
// aufrufbar. Gedacht für Hardwaretests mit der Firmware, nicht für die App. Beispiele:
//   npx convex run device_commands:adminCreateCommand '{"device_id":"cg-00A5D8","type":"measure_now","params":{}}'
//   npx convex run device_commands:adminCreateCommand '{"device_id":"cg-00A5D8","type":"ota_now","params":{}}'
//   npx convex run device_commands:adminCreateCommand '{"device_id":"cg-00A5D8","type":"factory_reset","params":{}}'
//   npx convex run device_commands:adminCreateCommand '{"device_id":"cg-00A5D8","type":"set_wifi","params":{"ssid":"MeinWLAN","password":"…"}}'
//   npx convex run device_commands:adminCreateCommand '{"device_id":"cg-00A5D8","type":"set_config","params":{"samples":30,"online_poll_s":30}}'
//   npx convex run device_commands:adminGetCommandStatus '{"command_id":"c_…"}'
// Achtung: factory_reset mit Ack ok gibt den Sensor frei (wie removeSensor).

export const adminCreateCommand = internalMutation({
  args: {
    device_id: v.string(),
    type: v.union(
      v.literal("measure_now"),
      v.literal("set_wifi"),
      v.literal("factory_reset"),
      v.literal("ota_now"),
      v.literal("set_config"),
    ),
    params: v.object({
      ssid: v.optional(v.string()),
      password: v.optional(v.string()),
      settle_ms: v.optional(v.number()),
      samples: v.optional(v.number()),
      low_battery_v: v.optional(v.number()),
      critical_battery_v: v.optional(v.number()),
      online_poll_s: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const sensor = await ctx.db
      .query("sensors")
      .withIndex("by_device_id", (q) => q.eq("device_id", args.device_id))
      .first();
    if (!sensor) {
      throw new Error("Sensor not found");
    }

    if (args.type === "set_config") {
      const { ssid: _ssid, password: _password, ...config } = args.params;
      return await enqueueSetConfig(ctx, args.device_id, config);
    }
    if (args.type === "set_wifi") {
      const ssid = args.params.ssid ?? "";
      const password = args.params.password ?? "";
      assertValidWifi(ssid, password);
      return await createCommand(ctx, { device_id: args.device_id, type: "set_wifi", params: { ssid, password } });
    }
    // measure_now, factory_reset, ota_now: ohne Parameter wie in den öffentlichen Mutationen.
    return await createCommand(ctx, { device_id: args.device_id, type: args.type, params: {} });
  },
});

export const adminGetCommandStatus = internalQuery({
  args: { command_id: v.string() },
  handler: async (ctx, args) => {
    const command = await ctx.db
      .query("device_commands")
      .withIndex("by_command_id", (q) => q.eq("command_id", args.command_id))
      .first();
    return command ? toCommandStatus(command) : null;
  },
});

// --- Geräte-Seite ---

// Abholpfad in einem Zug: Token prüfen und offene Befehle lesen (eine Query). Im Leerlauf ist das
// der einzige Datenbank-Aufruf; nur wenn noch pending-Befehle dabei sind, folgt markCommandsDelivered.
export const peekCommandsForToken = internalQuery({
  args: { device_token_hash: v.string() },
  handler: async (ctx, args) => {
    const sensor = await ctx.db
      .query("sensors")
      .withIndex("by_device_token_hash", (q) => q.eq("device_token_hash", args.device_token_hash))
      .first();
    if (!sensor) {
      return null;
    }
    // Älteste zuerst, höchstens 10 pro Antwort. Der Rest folgt beim nächsten Abholen.
    const commands = (await getOpenCommands(ctx, sensor.device_id, Date.now())).slice(0, MAX_COMMANDS_PER_RESPONSE);
    return {
      device_id: sensor.device_id,
      commands: commands.map((command) => ({ id: command.command_id, type: command.type, params: command.params })),
      pending_ids: commands.filter((command) => command.status === "pending").map((command) => command._id),
    };
  },
});

export const markCommandsDelivered = internalMutation({
  args: { device_id: v.string(), command_doc_ids: v.array(v.id("device_commands")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const id of args.command_doc_ids) {
      const command = await ctx.db.get(id);
      // Nur noch offene Befehle desselben Geräts; inzwischen quittierte bleiben unberührt.
      if (command && command.device_id === args.device_id && command.status === "pending") {
        await ctx.db.patch(id, { status: "delivered", delivered_at: now });
      }
    }
  },
});

export const ackCommand = internalMutation({
  args: {
    device_id: v.string(),
    command_id: v.string(),
    result: v.union(v.literal("ok"), v.literal("failed")),
    detail: v.string(),
  },
  handler: async (ctx, args) => {
    const command = await ctx.db
      .query("device_commands")
      .withIndex("by_command_id", (q) => q.eq("command_id", args.command_id))
      .first();
    if (!command) {
      return { outcome: "unknown" } as const;
    }
    if (command.device_id !== args.device_id) {
      return { outcome: "foreign" } as const;
    }
    // Wiederholtes Ack: idempotent, nichts ändern.
    if (command.status === "ok" || command.status === "failed") {
      return { outcome: "ok" } as const;
    }

    // Auch ein bereits abgelaufener/ersetzter Befehl kann ausgeführt worden sein: Ergebnis festhalten.
    await ctx.db.patch(command._id, {
      status: args.result,
      acked_at: Date.now(),
      detail: args.detail,
      params: withoutPassword(command.params),
    });

    // factory_reset mit ok: dieselbe Freigabe wie removeSensor, sofern das Gerät noch dem Auftraggeber gehört.
    if (command.type === "factory_reset" && args.result === "ok") {
      const sensor = await ctx.db
        .query("sensors")
        .withIndex("by_device_id", (q) => q.eq("device_id", command.device_id))
        .first();
      if (sensor && (!command.created_by || sensor.clerk_id === command.created_by)) {
        await releaseSensor(ctx, sensor, "factory_reset");
      }
    }

    return { outcome: "ok" } as const;
  },
});

const rejectAuth = (auth: Awaited<ReturnType<typeof authenticateDevice>>) => {
  if (auth.kind === "missing" || auth.kind === "invalid") {
    console.warn("[device/commands] unauthorized", { reason: auth.kind });
    return jsonResponse(401, { error: "unauthorized" });
  }
  if (auth.kind === "malformed") {
    return jsonResponse(400, { error: "invalid_authorization_header" });
  }
  return null;
};

// GET /device/commands (Bearer). Optionaler Query-Parameter device_id: muss zum Token passen (sonst 403).
// Aufrufe pro Abfrage: Leerlauf HTTP-Action + 1 Query; mit neuen Befehlen zusätzlich 1 Mutation.
export const getCommandsHttp = httpAction(async (ctx, request) => {
  const bearer = await parseDeviceBearer(request);
  if (bearer.kind !== "token") {
    return rejectAuth(bearer) ?? jsonResponse(401, { error: "unauthorized" });
  }

  let deviceId: string | null = null;
  try {
    const result = await ctx.runQuery(internal.device_commands.peekCommandsForToken, {
      device_token_hash: bearer.device_token_hash,
    });
    if (!result) {
      return rejectAuth({ kind: "invalid" }) ?? jsonResponse(401, { error: "unauthorized" });
    }
    deviceId = result.device_id;

    const requestedDevice = new URL(request.url).searchParams.get("device_id");
    if (requestedDevice !== null && requestedDevice !== result.device_id) {
      return jsonResponse(403, { error: "device_mismatch" });
    }

    if (result.pending_ids.length > 0) {
      await ctx.runMutation(internal.device_commands.markCommandsDelivered, {
        device_id: result.device_id,
        command_doc_ids: result.pending_ids,
      });
    }
    return jsonResponse(200, { commands: result.commands });
  } catch (error) {
    console.error("[device/commands] fetch failed", { device_id: deviceId, error: String(error) });
    return jsonResponse(500, { error: "internal_error" });
  }
});

// POST /device/commands/ack (Bearer). 200 auch bei wiederholtem Ack, 403 fremder Befehl, 400 unbekannt/ungültig.
export const ackCommandHttp = httpAction(async (ctx, request) => {
  const auth = await authenticateDevice(ctx, request);
  const authError = rejectAuth(auth);
  if (authError || auth.kind !== "ok") {
    return authError ?? jsonResponse(401, { error: "unauthorized" });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== "object" || parsed === null) {
      return jsonResponse(400, { error: "invalid_request" });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  const { id, result, detail } = body;
  if (typeof id !== "string" || !COMMAND_ID_PATTERN.test(id) || (result !== "ok" && result !== "failed")) {
    return jsonResponse(400, { error: "invalid_request" });
  }
  if (detail !== undefined && typeof detail !== "string") {
    return jsonResponse(400, { error: "invalid_detail" });
  }

  try {
    const outcome = await ctx.runMutation(internal.device_commands.ackCommand, {
      device_id: auth.device_id,
      command_id: id,
      result,
      detail: (detail ?? "").slice(0, MAX_DETAIL_LENGTH),
    });
    if (outcome.outcome === "unknown") return jsonResponse(400, { error: "unknown_command" });
    if (outcome.outcome === "foreign") return jsonResponse(403, { error: "device_mismatch" });
    return jsonResponse(200, { ok: true });
  } catch (error) {
    console.error("[device/commands/ack] failed", { device_id: auth.device_id, error: String(error) });
    return jsonResponse(500, { error: "internal_error" });
  }
});
