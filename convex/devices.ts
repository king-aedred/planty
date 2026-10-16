import { action, httpAction, internalMutation, internalQuery, query } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

// Onboarding und Claim nach Vertrag Firmware v7 (Abschnitt 3 und 4).
// Ablauf: App holt createClaimToken -> gibt ihn per BLE ans Gerät -> Gerät ruft POST /device/claim.

const CLAIM_TOKEN_TTL_MS = 15 * 60 * 1000;
export const DEVICE_ID_PATTERN = /^cg-[0-9A-F]{6}$/;
const CLAIM_TOKEN_PATTERN = /^[A-Z2-7]{32}$/;
const MAX_META_LENGTH = 64;
// Firmware reserviert 64 Zeichen pro Token-Feld.
const MAX_TOKEN_LENGTH = 64;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// Zufall und Hashing nur in Actions/HTTP Actions, nicht in Mutations
// (deren Zufallsquelle ist für Geheimnisse nicht gedacht).
const randomBytes = (length: number) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

// 20 Byte = 160 Bit = genau 32 Base32-Zeichen ohne Padding.
const generateClaimToken = () => {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of randomBytes(20)) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return output;
};

// 32 Byte = 256 Bit = 43 Zeichen base64url ohne Padding.
const generateDeviceToken = () => {
  let binary = "";
  for (const byte of randomBytes(32)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

// Geräte-Konfiguration (v7 Abschnitt 8). Plausible Bereiche; ungültige Felder werden weggelassen,
// nicht abgelehnt, damit ein Tippfehler im Dashboard nie die Antwort ans Gerät verhindert.
// Standardwerte der Firmware laut Vertrag, nur für den Vergleich der beiden Akkuschwellen.
const FIRMWARE_DEFAULT_LOW_BATTERY_V = 3.4;
const FIRMWARE_DEFAULT_CRITICAL_BATTERY_V = 3.2;
const CONFIG_RANGES = {
  settle_ms: { min: 50, max: 30000, integer: true },
  samples: { min: 1, max: 200, integer: true },
  low_battery_v: { min: 3.0, max: 4.2, integer: false },
  critical_battery_v: { min: 2.8, max: 4.0, integer: false },
  online_poll_s: { min: 2, max: 3600, integer: true },
} as const;

export type DeviceConfig = Partial<Record<keyof typeof CONFIG_RANGES, number>>;

export const sanitizeDeviceConfig = (config: unknown): DeviceConfig => {
  if (typeof config !== "object" || config === null) return {};
  const raw = config as Record<string, unknown>;
  const result: DeviceConfig = {};

  for (const [field, range] of Object.entries(CONFIG_RANGES) as [keyof typeof CONFIG_RANGES, (typeof CONFIG_RANGES)[keyof typeof CONFIG_RANGES]][]) {
    const value = raw[field];
    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= range.min &&
      value <= range.max &&
      (!range.integer || Number.isInteger(value))
    ) {
      result[field] = value;
    }
  }

  // Kritische Schwelle muss unter der Warnschwelle liegen, sonst beide weglassen.
  const low = result.low_battery_v ?? FIRMWARE_DEFAULT_LOW_BATTERY_V;
  const critical = result.critical_battery_v ?? FIRMWARE_DEFAULT_CRITICAL_BATTERY_V;
  if (critical >= low) {
    delete result.low_battery_v;
    delete result.critical_battery_v;
  }

  return result;
};

export const createClaimToken = action({
  args: {},
  handler: async (ctx): Promise<{ claim_token: string; claim_id: Id<"claim_tokens">; expires_at: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const claimToken = generateClaimToken();
    const expiresAt = Date.now() + CLAIM_TOKEN_TTL_MS;
    const claimId: Id<"claim_tokens"> = await ctx.runMutation(internal.devices.storeClaimToken, {
      token_hash: await sha256Hex(claimToken),
      clerk_id: identity.subject,
      expires_at: expiresAt,
    });

    return { claim_token: claimToken, claim_id: claimId, expires_at: expiresAt };
  },
});

export const storeClaimToken = internalMutation({
  args: {
    token_hash: v.string(),
    clerk_id: v.string(),
    expires_at: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("claim_tokens", { ...args, created_at: Date.now() });
  },
});

// Polling-Ziel der App während des Onboardings (reaktiv über useQuery).
export const getClaimStatus = query({
  args: {
    claim_id: v.id("claim_tokens"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const claim = await ctx.db.get(args.claim_id);
    if (!claim || claim.clerk_id !== identity.subject) {
      return null;
    }

    if (claim.used_at !== undefined) {
      return { status: "claimed" as const, device_id: claim.device_id ?? null };
    }

    return {
      status: claim.expires_at < Date.now() ? ("expired" as const) : ("pending" as const),
      device_id: null,
    };
  },
});

export const claimDevice = internalMutation({
  args: {
    device_id: v.string(),
    claim_token_hash: v.string(),
    device_token_hash: v.string(),
    fw_version: v.optional(v.string()),
    hw_rev: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const claim = await ctx.db
      .query("claim_tokens")
      .withIndex("by_token_hash", (q) => q.eq("token_hash", args.claim_token_hash))
      .first();

    if (!claim || claim.used_at !== undefined || claim.expires_at < now) {
      return { ok: false } as const;
    }

    await ctx.db.patch(claim._id, { used_at: now, device_id: args.device_id });

    const sensor = await ctx.db
      .query("sensors")
      .withIndex("by_device_id", (q) => q.eq("device_id", args.device_id))
      .first();

    // Jeder Claim stellt ein neues device_token aus, das alte wird damit ungültig.
    const ownership = {
      clerk_id: claim.clerk_id,
      device_token_hash: args.device_token_hash,
      firmware_version: args.fw_version,
      hw_rev: args.hw_rev,
      reset_requested: false,
      status: "active" as const,
      last_seen: now,
    };

    if (!sensor) {
      await ctx.db.insert("sensors", { device_id: args.device_id, ...ownership, claimed_at: now, created_at: now });
      return { ok: true, config: {} } as const;
    }

    const config = sanitizeDeviceConfig(sensor.config);
    const previousOwner = sensor.clerk_id;
    if (previousOwner === claim.clerk_id) {
      await ctx.db.patch(sensor._id, ownership);
      return { ok: true, config } as const;
    }

    await ctx.db.patch(sensor._id, { ...ownership, claimed_at: now });

    if (previousOwner) {
      // Physischer Besitz zählt: Gerät wechselt den Besitzer. Pflanzen des alten
      // Besitzers werden gelöst, damit dort keine fremden Messwerte mehr landen.
      const plantsByDevice = await ctx.db
        .query("plants")
        .withIndex("by_device_id", (q) => q.eq("device_id", args.device_id))
        .collect();
      const plantsBySensor = await ctx.db
        .query("plants")
        .withIndex("by_sensor_id", (q) => q.eq("sensor_id", args.device_id))
        .collect();
      const previousPlants = [...plantsByDevice, ...plantsBySensor].filter(
        (plant, index, all) => plant.clerk_id === previousOwner && all.findIndex((other) => other._id === plant._id) === index,
      );

      for (const plant of previousPlants) {
        await ctx.db.patch(plant._id, { device_id: undefined, sensor_id: undefined });
      }

      await ctx.db.insert("messages", {
        clerk_id: previousOwner,
        device_id: args.device_id,
        plant_name: previousPlants[0]?.name ?? args.device_id,
        type: "system_message",
        state: "warning",
        text: `Dein Sensor ${args.device_id} wurde mit einem anderen Konto verbunden und ist nicht mehr deinem Konto zugeordnet.`,
        read: false,
        created_at: now,
      });
    }

    return { ok: true, config } as const;
  },
});

// Geräte-Authentifizierung (Firmware v7 Abschnitt 3): Das Token wird wie in /device/claim nur
// als SHA-256-Hash in sensors.device_token_hash abgelegt. Ein neuer Claim überschreibt den Hash,
// das alte Token findet danach keinen Sensor mehr.
export const findDeviceByTokenHash = internalQuery({
  args: { device_token_hash: v.string() },
  handler: async (ctx, args) => {
    const sensor = await ctx.db
      .query("sensors")
      .withIndex("by_device_token_hash", (q) => q.eq("device_token_hash", args.device_token_hash))
      .first();
    return sensor ? { device_id: sensor.device_id } : null;
  },
});

export type DeviceAuth =
  | { kind: "ok"; device_id: string }
  // Kein Authorization-Header (v6-Geräte).
  | { kind: "missing" }
  // Header da, aber kein Bearer-Schema.
  | { kind: "malformed" }
  // Bearer-Token unbekannt oder durch neueren Claim ersetzt. Einziger Fall für 401.
  | { kind: "invalid" };

// Liest den Authorization-Header ohne Datenbankzugriff und liefert den Hash des Tokens.
// Für Endpunkte, die die Token-Prüfung mit eigener Logik in einer Query bündeln (/device/commands).
export const parseDeviceBearer = async (
  request: Request,
): Promise<{ kind: "token"; device_token_hash: string } | Exclude<DeviceAuth, { kind: "ok" }>> => {
  const header = request.headers.get("Authorization");
  if (header === null) {
    return { kind: "missing" };
  }

  const match = /^Bearer\s+(\S*)\s*$/i.exec(header);
  if (!match) {
    return { kind: "malformed" };
  }

  const token = match[1];
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    return { kind: "invalid" };
  }

  return { kind: "token", device_token_hash: await sha256Hex(token) };
};

// Achtung: Auf jedes 401 löscht das Gerät sein Token. Das Token selbst nie loggen.
export const authenticateDevice = async (ctx: ActionCtx, request: Request): Promise<DeviceAuth> => {
  const bearer = await parseDeviceBearer(request);
  if (bearer.kind !== "token") {
    return bearer;
  }

  const device = await ctx.runQuery(internal.devices.findDeviceByTokenHash, {
    device_token_hash: bearer.device_token_hash,
  });
  return device ? { kind: "ok", device_id: device.device_id } : { kind: "invalid" };
};

export const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const isOptionalMeta = (value: unknown) =>
  value === undefined || (typeof value === "string" && value.length <= MAX_META_LENGTH);

// POST /device/claim (ohne Authorization-Header). 200 mit device_token, 400 ungültig, 410 Token abgelaufen/verbraucht.
export const claimDeviceHttp = httpAction(async (ctx, request) => {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") {
      return jsonResponse(400, { error: "invalid_request" });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  const { device_id, claim_token, fw_version, hw_rev } = body;
  if (
    typeof device_id !== "string" ||
    !DEVICE_ID_PATTERN.test(device_id) ||
    typeof claim_token !== "string" ||
    !CLAIM_TOKEN_PATTERN.test(claim_token) ||
    !isOptionalMeta(fw_version) ||
    !isOptionalMeta(hw_rev)
  ) {
    return jsonResponse(400, { error: "invalid_request" });
  }

  const deviceToken = generateDeviceToken();
  const result = await ctx.runMutation(internal.devices.claimDevice, {
    device_id,
    claim_token_hash: await sha256Hex(claim_token),
    device_token_hash: await sha256Hex(deviceToken),
    fw_version: fw_version as string | undefined,
    hw_rev: hw_rev as string | undefined,
  });

  if (!result.ok) {
    return jsonResponse(410, { error: "claim_token_invalid" });
  }

  // config nur mitliefern, wenn für das Gerät etwas gesetzt ist.
  return jsonResponse(200, {
    device_token: deviceToken,
    ...(Object.keys(result.config).length > 0 ? { config: result.config } : {}),
  });
});
