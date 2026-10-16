import { httpAction, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Infer } from "convex/values";
import { authenticateDevice, DEVICE_ID_PATTERN, jsonResponse, sanitizeDeviceConfig } from "./devices";
import { hasOpenCommands } from "./device_commands";
import { findOtaOffer, parseSemver, recordOtaRollback } from "./firmware";
import { applyBatchHealth } from "./sensor_alerts";

// POST /readings/batch nach Vertrag Firmware v7 Abschnitt 5 und 10.
// Statuscodes: 200 ok, 400 Struktur ungültig (Gerät verwirft die Messungen),
// 401 nur bei fehlendem oder ungültigem Token, 403 Token gehört zu einem anderen Gerät,
// 500 interner Fehler (Gerät behält die Messungen im Puffer).

const MAX_READINGS_PER_BATCH = 24;
const MAX_META_LENGTH = 64;

const nullableNumber = v.optional(v.union(v.number(), v.null()));

const batchReading = v.object({
  seq: v.number(),
  measured_at: v.number(),
  time_synced: v.boolean(),
  moisture_pct: v.union(v.number(), v.null()),
  moisture_raw: v.optional(v.number()),
  moisture_raw_min: v.optional(v.number()),
  moisture_raw_max: v.optional(v.number()),
  temperature_c: nullableNumber,
  humidity_pct: nullableNumber,
  lux: nullableNumber,
  battery_v: v.optional(v.number()),
  charging: v.optional(v.boolean()),
  usb: v.optional(v.boolean()),
});

const batchStatus = v.object({
  boot_count: v.optional(v.number()),
  wake_cause: v.optional(v.string()),
  wifi_connect_ms: v.optional(v.number()),
  rssi: v.optional(v.number()),
  error_flags: v.optional(v.number()),
  buffered_count: v.optional(v.number()),
  next_contact_at: v.optional(v.number()),
  ota_rollback_version: v.optional(v.string()),
});

type BatchReading = Infer<typeof batchReading>;
type BatchStatus = Infer<typeof batchStatus>;

export const storeReadingsBatch = internalMutation({
  args: {
    device_id: v.string(),
    fw_version: v.optional(v.string()),
    readings: v.array(batchReading),
    status: v.optional(batchStatus),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const sensor = await ctx.db
      .query("sensors")
      .withIndex("by_device_id", (q) => q.eq("device_id", args.device_id))
      .first();

    // Firmware meldet einen komplett unlesbaren Feuchtesensor mit moisture_raw 0 (und moisture_pct 0).
    // Das ist ein Sensorausfall, keine trockene Pflanze.
    const hasMoistureSensorError = (reading: BatchReading) => reading.moisture_raw === 0;

    const acceptedSeqs: number[] = [];
    const insertedSeqs = new Set<number>();

    // Idempotenz: vor jedem Insert per Index (device_id, seq) prüfen. Mutationen sind
    // transaktional und sehen eigene Writes, doppelte seqs im selben Batch landen also auch nur einmal.
    for (const reading of args.readings) {
      const existing = await ctx.db
        .query("device_readings")
        .withIndex("by_device_and_seq", (q) => q.eq("device_id", args.device_id).eq("seq", reading.seq))
        .first();

      if (!existing) {
        await ctx.db.insert("device_readings", {
          ...reading,
          ...(hasMoistureSensorError(reading) ? { moisture_sensor_error: true } : {}),
          device_id: args.device_id,
          clerk_id: sensor?.clerk_id,
          fw_version: args.fw_version,
          received_at: now,
        });
        insertedSeqs.add(reading.seq);
      }

      if (!acceptedSeqs.includes(reading.seq)) {
        acceptedSeqs.push(reading.seq);
      }
    }

    const newest = args.readings.reduce((latest, reading) => (reading.seq > latest.seq ? reading : latest));

    // Rollback-Meldung vor der OTA-Auswahl verbuchen, damit ein gerade deaktiviertes Release
    // in dieser Antwort nicht mehr angeboten wird.
    if (args.status?.ota_rollback_version && sensor?.hw_rev) {
      await recordOtaRollback(ctx, {
        version: args.status.ota_rollback_version,
        hw_rev: sensor.hw_rev,
        device_id: args.device_id,
      });
    }

    if (sensor) {
      await ctx.db.patch(sensor._id, {
        last_seen: now,
        status: "active",
        ...(args.fw_version ? { firmware_version: args.fw_version } : {}),
        ...(args.status?.next_contact_at !== undefined ? { next_contact_at: args.status.next_contact_at * 1000 } : {}),
        ...(newest.battery_v !== undefined ? { last_battery_v: newest.battery_v } : {}),
        ...(args.status ? { last_status: args.status } : {}),
        // Hinweise wieder scharf stellen, Sensorfehler intern markieren (convex/sensor_alerts.ts).
        ...applyBatchHealth(sensor, args.readings, now),
      });
    }

    // Benachrichtigungen: nur die Messung mit der höchsten seq IN DIESEM REQUEST auswerten, und nur,
    // wenn sie in diesem Request neu eingefügt wurde. Bewusst kein Vergleich mit früheren seqs des
    // Geräts: Nach einem NVS-Löschen startet seq bei einem Zufallswert und kann kleiner sein.
    // Gepufferte ältere Messungen werden gespeichert, lösen aber nichts aus (sonst kämen nach
    // einem WLAN-Ausfall mehrere Nachrichten auf einmal); Wiederholungen ebenfalls nicht.
    let evaluation: "scheduled" | "skipped_not_new" | "skipped_no_moisture" | "skipped_moisture_sensor_error" =
      "skipped_not_new";
    if (insertedSeqs.has(newest.seq)) {
      if (hasMoistureSensorError(newest)) {
        // Sonst gäbe es einen falschen kritischen Durst-Alarm.
        evaluation = "skipped_moisture_sensor_error";
      } else if (typeof newest.moisture_pct === "number") {
        await feedEvaluation(ctx, args.device_id, newest, newest.moisture_pct, now);
        evaluation = "scheduled";
      } else {
        evaluation = "skipped_no_moisture";
      }
    }

    return {
      accepted_seqs: acceptedSeqs,
      evaluation,
      config: sanitizeDeviceConfig(sensor?.config),
      // true, solange nicht abgelaufene Befehle pending oder delivered sind. Das Gerät holt sie dann sofort ab.
      commands_pending: await hasOpenCommands(ctx, args.device_id, now),
      // Gleiches Objekt wie GET /firmware/latest, sonst null. hw_rev stammt aus dem Claim.
      ota:
        sensor?.hw_rev
          ? await findOtaOffer(ctx, {
              hw_rev: sensor.hw_rev,
              fw_version: args.fw_version ?? sensor.firmware_version ?? "",
              device_id: args.device_id,
            })
          : null,
    };
  },
});

// Füttert dieselbe Auswertung wie POST /readings: eine Session mit genau dieser Messung,
// danach readings.triggerProcessSession (externer Prozessor erstellt Summary und Benachrichtigungen
// und löscht die Session-Rohdaten wieder; die dauerhafte Kopie liegt in device_readings).
const feedEvaluation = async (
  ctx: MutationCtx,
  deviceId: string,
  reading: BatchReading,
  moisture: number,
  now: number,
) => {
  // Ohne Zeit-Sync ist measured_at ungenau: für Datum/Zeitstempel der Auswertung Serverzeit nehmen.
  const timestamp = new Date(reading.time_synced ? reading.measured_at * 1000 : now).toISOString();
  const date = timestamp.slice(0, 10);

  const sessionId = await ctx.db.insert("sensor_sessions", {
    sensor_id: deviceId,
    date,
    started_at: now,
    readings_count: 1,
    status: "collecting",
  });

  await ctx.db.insert("readings", {
    sensor_id: deviceId,
    session_id: sessionId,
    moisture,
    // Feuchte wird immer ausgewertet. Fehlt Temperatur oder Licht (Sensor ausgefallen),
    // überspringt der Prozessor nur diese Dimension.
    ...(typeof reading.temperature_c === "number" ? { temperature: reading.temperature_c } : {}),
    ...(typeof reading.lux === "number" ? { light_level: reading.lux } : {}),
    battery_voltage: reading.battery_v,
    timestamp,
  });

  // Nicht blockierend: Der Webhook darf die Antwort ans Gerät (15-s-Timeout) nicht verzögern.
  await ctx.scheduler.runAfter(0, internal.readings.triggerProcessSession, {
    session_id: sessionId,
    sensor_id: deviceId,
    date,
    reason: "complete",
  });
};

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const optionalNumber = (value: unknown) => value === undefined || isFiniteNumber(value);
const nullableNumberValue = (value: unknown) => value === undefined || value === null || isFiniteNumber(value);
const optionalBoolean = (value: unknown) => value === undefined || typeof value === "boolean";

const parseReading = (value: unknown): BatchReading | null => {
  if (typeof value !== "object" || value === null) return null;
  const r = value as Record<string, unknown>;

  if (
    !isFiniteNumber(r.seq) ||
    !Number.isInteger(r.seq) ||
    r.seq < 0 ||
    !isFiniteNumber(r.measured_at) ||
    typeof r.time_synced !== "boolean" ||
    // moisture_pct ist Pflicht, darf aber null sein (Sensor ausgefallen).
    !(r.moisture_pct === null || isFiniteNumber(r.moisture_pct)) ||
    !optionalNumber(r.moisture_raw) ||
    !optionalNumber(r.moisture_raw_min) ||
    !optionalNumber(r.moisture_raw_max) ||
    !nullableNumberValue(r.temperature_c) ||
    !nullableNumberValue(r.humidity_pct) ||
    !nullableNumberValue(r.lux) ||
    !optionalNumber(r.battery_v) ||
    !optionalBoolean(r.charging) ||
    !optionalBoolean(r.usb)
  ) {
    return null;
  }

  // Nur bekannte Felder übernehmen (der Validator der Mutation lehnt unbekannte ab).
  return withoutUndefined({
    seq: r.seq,
    measured_at: r.measured_at,
    time_synced: r.time_synced,
    moisture_pct: r.moisture_pct as number | null,
    moisture_raw: r.moisture_raw as number | undefined,
    moisture_raw_min: r.moisture_raw_min as number | undefined,
    moisture_raw_max: r.moisture_raw_max as number | undefined,
    temperature_c: r.temperature_c as number | null | undefined,
    humidity_pct: r.humidity_pct as number | null | undefined,
    lux: r.lux as number | null | undefined,
    battery_v: r.battery_v as number | undefined,
    charging: r.charging as boolean | undefined,
    usb: r.usb as boolean | undefined,
  });
};

const withoutUndefined = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;

const parseStatus = (value: unknown): BatchStatus | null | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null) return null;
  const s = value as Record<string, unknown>;
  const numberFields = ["boot_count", "wifi_connect_ms", "rssi", "error_flags", "buffered_count", "next_contact_at"] as const;
  if (!numberFields.every((field) => optionalNumber(s[field])) || !(s.wake_cause === undefined || typeof s.wake_cause === "string")) {
    return null;
  }
  const status: BatchStatus = {};
  for (const field of numberFields) {
    if (s[field] !== undefined) status[field] = s[field] as number;
  }
  if (typeof s.wake_cause === "string") status.wake_cause = s.wake_cause.slice(0, MAX_META_LENGTH);
  // Optional; falsches Format wird ignoriert statt abgelehnt (4xx würde den ganzen Puffer verwerfen).
  if (
    typeof s.ota_rollback_version === "string" &&
    s.ota_rollback_version.length <= MAX_META_LENGTH &&
    parseSemver(s.ota_rollback_version)
  ) {
    status.ota_rollback_version = s.ota_rollback_version;
  }
  return status;
};

export const readingsBatchHttp = httpAction(async (ctx, request) => {
  // Header ist hier Pflicht: fehlt er oder ist das Token ungültig/ersetzt, dann 401.
  const auth = await authenticateDevice(ctx, request);
  if (auth.kind === "missing" || auth.kind === "invalid") {
    console.warn("[readings/batch] unauthorized", { reason: auth.kind });
    return jsonResponse(401, { error: "unauthorized" });
  }
  if (auth.kind === "malformed") {
    return jsonResponse(400, { error: "invalid_authorization_header" });
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

  const { device_id, fw_version, readings } = body;
  if (typeof device_id !== "string" || !DEVICE_ID_PATTERN.test(device_id)) {
    return jsonResponse(400, { error: "invalid_device_id" });
  }
  if (fw_version !== undefined && (typeof fw_version !== "string" || fw_version.length > MAX_META_LENGTH)) {
    return jsonResponse(400, { error: "invalid_fw_version" });
  }
  if (!Array.isArray(readings) || readings.length === 0 || readings.length > MAX_READINGS_PER_BATCH) {
    return jsonResponse(400, { error: "invalid_readings_count" });
  }
  const parsedReadings = readings.map(parseReading);
  if (parsedReadings.some((reading) => reading === null)) {
    return jsonResponse(400, { error: "invalid_reading" });
  }
  const status = parseStatus(body.status);
  if (status === null) {
    return jsonResponse(400, { error: "invalid_status" });
  }

  if (device_id !== auth.device_id) {
    return jsonResponse(403, { error: "device_mismatch" });
  }

  try {
    const result = await ctx.runMutation(internal.device_readings.storeReadingsBatch, {
      device_id,
      fw_version: fw_version as string | undefined,
      readings: parsedReadings as BatchReading[],
      status,
    });

    return jsonResponse(200, {
      accepted_seqs: result.accepted_seqs,
      config: result.config,
      commands_pending: result.commands_pending,
      ota: result.ota,
    });
  } catch (error) {
    console.error("[readings/batch] store failed", { device_id, error: String(error) });
    return jsonResponse(500, { error: "internal_error" });
  }
});
