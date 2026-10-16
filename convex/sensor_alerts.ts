import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Offline- und Akku-Hinweise nach Vertrag Firmware v7 Abschnitt 9. Läuft als Convex-Cron (convex/crons.ts).
// - Offline: next_contact_at (ms) mehr als 2 h überschritten. Nur v7-Geräte mit Besitzer.
// - Akku: last_battery_v unter 3,5 V (bald laden) bzw. 3,3 V (dringend), nicht während Laden/USB.
// - Je Art höchstens eine Meldung pro Kalendertag (Europe/Berlin) und Sensor. Nach dem Versand ist die Art
//   "entschärft": Offline wird wieder scharf, sobald Daten kommen; Akku, wenn > 3,7 V oder Laden/USB.
// - Kontaktzeitfenster des Nutzers wie bei Pflanzenmeldungen. Außerhalb wird nichts gesendet; der nächste
//   Lauf im Fenster holt die Meldung nach, solange der Zustand noch besteht.
// - Zählt nicht auf max_notifications_per_day.
// - Versand: Inbox-Nachricht (system_message) + n8n-System-Webhook (gleiche Payload-Form wie
//   backend/src/lib/sensorProblem.ts). NOTIFY_DRY_RUN=1 schreibt nur ins Log, ohne Inbox und Webhook.
//   NOTIFY_REAL_SEND_DEVICE_IDS (kommagetrennt, nur für Tests) nimmt einzelne Geräte vom Dry-Run aus;
//   diese Geräte umgehen zusätzlich das Kontaktzeitfenster. Nach dem Test wieder leeren.

const OFFLINE_GRACE_MS = 2 * 60 * 60 * 1000;
export const BATTERY_LOW_V = 3.5;
export const BATTERY_CRITICAL_V = 3.3;
export const BATTERY_REARM_V = 3.7;

type AlertKind = "offline" | "battery_low" | "battery_critical";
type AlertState = NonNullable<Doc<"sensors">["alert_state"]>;

const ALERTS: Record<AlertKind, { text: string; state: "warning" | "critical"; webhookState: string }> = {
  offline: {
    text: "Dein Sensor meldet sich nicht. Steck ihn kurz per USB an, um das WLAN neu einzurichten.",
    state: "warning",
    webhookState: "offline",
  },
  battery_low: {
    text: "Der Akku deines Sensors wird schwach. Bitte lade ihn bald per USB.",
    state: "warning",
    webhookState: "battery_low",
  },
  battery_critical: {
    text: "Der Akku deines Sensors ist fast leer. Bitte lade ihn jetzt per USB, sonst kann er keine Messwerte mehr senden.",
    state: "critical",
    webhookState: "battery_critical",
  },
};

const isTestDevice = (deviceId: string) =>
  (process.env.NOTIFY_REAL_SEND_DEVICE_IDS ?? "").split(",").map((entry) => entry.trim()).filter(Boolean).includes(deviceId);

const isDryRun = (deviceId: string) =>
  ["1", "true", "yes"].includes((process.env.NOTIFY_DRY_RUN ?? "").toLowerCase()) && !isTestDevice(deviceId);

const berlinDay = (timestamp: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(timestamp),
  );

const sentToday = (sentAt: number | undefined, now: number) => sentAt !== undefined && berlinDay(sentAt) === berlinDay(now);

// Gleiche Logik wie isOutsideContactWindow in backend/src/lib/processor.ts (Stunden in UTC).
const isOutsideContactWindow = (currentHour: number, start: number, end: number) =>
  start < end ? currentHour < start || currentHour >= end : currentHour < start && currentHour >= end;

const armed = (value: boolean | undefined) => value !== false;

// Welche Meldung ist für diesen Sensor jetzt fällig (noch ohne Zeitfenster)?
const dueAlerts = (sensor: Doc<"sensors">, now: number): AlertKind[] => {
  const state = sensor.alert_state ?? {};
  const due: AlertKind[] = [];

  if (
    sensor.next_contact_at !== undefined &&
    sensor.next_contact_at < now - OFFLINE_GRACE_MS &&
    armed(state.offline_armed) &&
    !sentToday(state.offline_sent_at, now)
  ) {
    due.push("offline");
  }

  const voltage = sensor.last_battery_v;
  const charging = sensor.last_charging === true || sensor.last_usb === true;
  if (voltage !== undefined && !charging) {
    if (voltage < BATTERY_CRITICAL_V) {
      if (armed(state.battery_critical_armed) && !sentToday(state.battery_critical_sent_at, now)) due.push("battery_critical");
    } else if (voltage < BATTERY_LOW_V) {
      if (armed(state.battery_low_armed) && !sentToday(state.battery_low_sent_at, now)) due.push("battery_low");
    }
  }

  return due;
};

const markSent = (state: AlertState, kind: AlertKind, now: number): AlertState => {
  if (kind === "offline") return { ...state, offline_armed: false, offline_sent_at: now };
  if (kind === "battery_low") return { ...state, battery_low_armed: false, battery_low_sent_at: now };
  // Dringend ersetzt "bald laden": die mildere Stufe nicht zusätzlich schicken.
  return { ...state, battery_critical_armed: false, battery_critical_sent_at: now, battery_low_armed: false };
};

const plantNameFor = async (ctx: MutationCtx, sensor: Doc<"sensors">) => {
  const plants = await ctx.db
    .query("plants")
    .withIndex("by_device_id", (q) => q.eq("device_id", sensor.device_id))
    .collect();
  return plants.find((plant) => plant.clerk_id === sensor.clerk_id)?.name ?? sensor.device_id;
};

export const checkSensorAlerts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Nur Sensoren mit gesetztem Wert (Index-Bereich schließt fehlende Felder aus).
    const offline = await ctx.db
      .query("sensors")
      .withIndex("by_next_contact_at", (q) => q.gt("next_contact_at", 0).lt("next_contact_at", now - OFFLINE_GRACE_MS))
      .collect();
    const lowBattery = await ctx.db
      .query("sensors")
      .withIndex("by_last_battery_v", (q) => q.gt("last_battery_v", 0).lt("last_battery_v", BATTERY_LOW_V))
      .collect();

    const candidates = new Map<string, Doc<"sensors">>();
    for (const sensor of [...offline, ...lowBattery]) {
      if (sensor.clerk_id) candidates.set(sensor._id, sensor);
    }

    const results: { device_id: string; kind: AlertKind; outcome: "sent" | "dry_run" | "outside_window" }[] = [];

    for (const sensor of candidates.values()) {
      const kinds = dueAlerts(sensor, now);
      if (kinds.length === 0 || !sensor.clerk_id) continue;

      const clerkId = sensor.clerk_id;
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerk_id", clerkId))
        .first();
      const start = user?.contact_window_start;
      const end = user?.contact_window_end;
      if (
        !isTestDevice(sensor.device_id) &&
        start !== undefined &&
        end !== undefined &&
        isOutsideContactWindow(new Date(now).getUTCHours(), start, end)
      ) {
        // Nicht senden, Zustand nicht ändern: Der nächste Lauf im Fenster holt die Meldung nach.
        for (const kind of kinds) results.push({ device_id: sensor.device_id, kind, outcome: "outside_window" });
        continue;
      }

      let state: AlertState = sensor.alert_state ?? {};
      const plantName = await plantNameFor(ctx, sensor);
      const dryRun = isDryRun(sensor.device_id);
      for (const kind of kinds) {
        state = markSent(state, kind, now);
        const alert = ALERTS[kind];
        if (dryRun) {
          console.log("[sensor_alerts] DRY RUN", { device_id: sensor.device_id, clerk_id: clerkId, kind, text: alert.text });
          results.push({ device_id: sensor.device_id, kind, outcome: "dry_run" });
          continue;
        }
        await ctx.db.insert("messages", {
          clerk_id: clerkId,
          device_id: sensor.device_id,
          plant_name: plantName,
          type: "system_message",
          state: alert.state,
          text: alert.text,
          read: false,
          created_at: now,
        });
        await ctx.scheduler.runAfter(0, internal.sensor_alerts.sendSystemNotification, {
          clerk_id: clerkId,
          device_id: sensor.device_id,
          plant_name: plantName,
          state: alert.webhookState,
          message: alert.text,
        });
        results.push({ device_id: sensor.device_id, kind, outcome: "sent" });
      }
      await ctx.db.patch(sensor._id, { alert_state: state });
    }

    if (results.length > 0) console.log("[sensor_alerts] run", { results });
    return results;
  },
});

// Versand über Hono (POST /sensor/alert), weil der n8n-System-Webhook nur lokal erreichbar ist.
// Hono ergänzt die Kanäle des Nutzers und schickt an n8n dieselbe Payload wie beim Sensor-Problem-Weg
// (backend/src/lib/sensorProblem.ts, override_contact_window: true; das Fenster ist hier schon geprüft).
// Adresse: BACKEND_SENSOR_ALERT_URL, sonst abgeleitet aus BACKEND_SENSOR_PROBLEM_URL (/sensor/problem -> /sensor/alert).
const sensorAlertUrl = () => {
  if (process.env.BACKEND_SENSOR_ALERT_URL) return process.env.BACKEND_SENSOR_ALERT_URL;
  const problemUrl = process.env.BACKEND_SENSOR_PROBLEM_URL;
  return problemUrl ? new URL("/sensor/alert", problemUrl).toString() : null;
};

export const sendSystemNotification = internalAction({
  args: {
    clerk_id: v.string(),
    device_id: v.string(),
    plant_name: v.string(),
    state: v.string(),
    message: v.string(),
  },
  handler: async (_ctx, args) => {
    const url = sensorAlertUrl();
    const secret = process.env.SENSOR_WEBHOOK_SECRET;
    if (!url || !secret) {
      console.error("[sensor_alerts] Hono-Adresse oder SENSOR_WEBHOOK_SECRET fehlt, nur Inbox-Nachricht erstellt", {
        device_id: args.device_id,
        state: args.state,
      });
      return;
    }
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify(args),
      });
      const result = (await response.json().catch(() => null)) as { n8n_status?: number | null } | null;
      const log = { device_id: args.device_id, state: args.state, hono_status: response.status, n8n_status: result?.n8n_status ?? null };
      if (response.ok) console.log("[sensor_alerts] forwarded", log);
      else console.error("[sensor_alerts] forwarding failed", log);
    } catch (error) {
      console.error("[sensor_alerts] Hono unreachable", { device_id: args.device_id, error: String(error) });
    }
  },
});

// true, wenn das Gerät schon /readings/batch nutzt (siehe /readings in convex/http.ts).
export const isBatchDevice = internalQuery({
  args: { device_id: v.string() },
  handler: async (ctx, args) => {
    const sensor = await ctx.db
      .query("sensors")
      .withIndex("by_device_id", (q) => q.eq("device_id", args.device_id))
      .first();
    return sensor?.batch_seen_at !== undefined;
  },
});

// Wird von /readings/batch aufgerufen: wieder scharf stellen und Sensorfehler intern markieren.
export const applyBatchHealth = (
  sensor: Doc<"sensors">,
  readings: { seq: number; moisture_raw?: number; temperature_c?: number | null; lux?: number | null; battery_v?: number; charging?: boolean; usb?: boolean }[],
  now: number,
) => {
  const ordered = [...readings].sort((left, right) => left.seq - right.seq);
  const newest = ordered[ordered.length - 1];
  const state: AlertState = { ...(sensor.alert_state ?? {}), offline_armed: true };
  if ((newest.battery_v !== undefined && newest.battery_v > BATTERY_REARM_V) || newest.charging === true || newest.usb === true) {
    state.battery_low_armed = true;
    state.battery_critical_armed = true;
  }

  // Sensorfehler: Feuchte unlesbar (moisture_raw 0) bzw. Temperatur/Licht mindestens 3x in Folge null.
  const streaks = { ...(sensor.null_streaks ?? { temperature: 0, lux: 0 }) };
  for (const reading of ordered) {
    streaks.temperature = reading.temperature_c === null ? streaks.temperature + 1 : reading.temperature_c === undefined ? streaks.temperature : 0;
    streaks.lux = reading.lux === null ? streaks.lux + 1 : reading.lux === undefined ? streaks.lux : 0;
  }
  const active = {
    moisture_sensor_error: newest.moisture_raw === 0,
    temperature_missing: streaks.temperature >= 3,
    light_missing: streaks.lux >= 3,
  };
  const previous = new Map((sensor.sensor_issues ?? []).map((issue) => [issue.kind, issue]));
  const issues = (Object.keys(active) as (keyof typeof active)[])
    .filter((kind) => active[kind])
    .map((kind) => ({ kind, first_seen_at: previous.get(kind)?.first_seen_at ?? now, last_seen_at: now }));

  return {
    alert_state: state,
    null_streaks: streaks,
    sensor_issues: issues,
    ...(newest.charging !== undefined ? { last_charging: newest.charging } : {}),
    ...(newest.usb !== undefined ? { last_usb: newest.usb } : {}),
    batch_seen_at: now,
  };
};
