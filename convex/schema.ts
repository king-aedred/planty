import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerk_id: v.string(),
    email: v.string(),
    plan: v.string(),
    is_dev: v.boolean(),
    max_notifications_per_day: v.optional(v.number()),
    notifications_sent_today: v.optional(v.number()),
    notifications_sent_date: v.optional(v.string()),
    notification_rules: v.optional(
      v.object({
        ok: v.array(v.union(v.literal("push"), v.literal("telegram"), v.literal("call"))),
        warning: v.array(v.union(v.literal("push"), v.literal("telegram"), v.literal("call"))),
        critical: v.array(v.union(v.literal("push"), v.literal("telegram"), v.literal("call"))),
      }),
    ),
    contact_window_start: v.optional(v.float64()),
    contact_window_end: v.optional(v.float64()),
    measure_time: v.optional(v.string()),
    phone_number: v.optional(v.string()),
    telegram_chat_id: v.optional(v.string()),
    telegram_connect_code: v.optional(v.string()),
    expo_push_token: v.optional(v.string()),
    created_at: v.number(),
  }).index("by_clerk_id", ["clerk_id"]),

  sensors: defineTable({
    device_id: v.string(),
    clerk_id: v.optional(v.string()),
    claimed_at: v.optional(v.number()),
    reset_requested: v.optional(v.boolean()),
    // SHA-256 (hex) des device_token aus POST /device/claim (Firmware v7). Klartext wird nie gespeichert.
    device_token_hash: v.optional(v.string()),
    firmware_version: v.optional(v.string()),
    hw_rev: v.optional(v.string()),
    // Aus POST /readings/batch (Firmware v7). next_contact_at in ms, Grundlage der späteren Offline-Erkennung.
    next_contact_at: v.optional(v.number()),
    last_battery_v: v.optional(v.number()),
    // Aus der neuesten Batch-Messung: lädt das Gerät gerade bzw. hängt es am USB?
    last_charging: v.optional(v.boolean()),
    last_usb: v.optional(v.boolean()),
    // Zeitpunkt des letzten /readings/batch. Gesetzt = v7-Gerät, das nicht mehr über /readings ausgewertet wird.
    batch_seen_at: v.optional(v.number()),
    // Offline- und Akku-Hinweise (v7 Abschnitt 9, convex/sensor_alerts.ts). armed fehlt = scharf.
    alert_state: v.optional(
      v.object({
        offline_armed: v.optional(v.boolean()),
        offline_sent_at: v.optional(v.number()),
        battery_low_armed: v.optional(v.boolean()),
        battery_low_sent_at: v.optional(v.number()),
        battery_critical_armed: v.optional(v.boolean()),
        battery_critical_sent_at: v.optional(v.number()),
      }),
    ),
    // Nur intern, keine Benachrichtigung: erkannte Sensorfehler.
    sensor_issues: v.optional(
      v.array(
        v.object({
          kind: v.union(v.literal("moisture_sensor_error"), v.literal("temperature_missing"), v.literal("light_missing")),
          first_seen_at: v.number(),
          last_seen_at: v.number(),
        }),
      ),
    ),
    // Aufeinanderfolgende Messungen ohne Temperatur bzw. Licht (null).
    null_streaks: v.optional(v.object({ temperature: v.number(), lux: v.number() })),
    // Geräte-Konfiguration (Firmware v7 Abschnitt 8), im Convex-Dashboard pro Gerät setzbar.
    // Wird in den Antworten von /device/claim und /readings/batch mitgeliefert. Fehlende Felder:
    // Firmware behält ihren Standard. Unplausible Werte werden beim Ausliefern weggelassen.
    config: v.optional(
      v.object({
        settle_ms: v.optional(v.number()),
        samples: v.optional(v.number()),
        low_battery_v: v.optional(v.number()),
        critical_battery_v: v.optional(v.number()),
        online_poll_s: v.optional(v.number()),
      }),
    ),
    last_status: v.optional(
      v.object({
        boot_count: v.optional(v.number()),
        wake_cause: v.optional(v.string()),
        wifi_connect_ms: v.optional(v.number()),
        rssi: v.optional(v.number()),
        error_flags: v.optional(v.number()),
        buffered_count: v.optional(v.number()),
        next_contact_at: v.optional(v.number()),
        // Version, auf die das Gerät nach einem fehlgeschlagenen OTA-Update zurückgerollt hat.
        ota_rollback_version: v.optional(v.string()),
      }),
    ),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("offline"),
        v.literal("charging"),
        v.literal("needs_remeasurement"),
        v.literal("measuring"),
      ),
    ),
    last_seen: v.number(),
    created_at: v.number(),
  })
    .index("by_device_id", ["device_id"])
    .index("by_clerk_id", ["clerk_id"])
    .index("by_device_token_hash", ["device_token_hash"])
    .index("by_next_contact_at", ["next_contact_at"])
    .index("by_last_battery_v", ["last_battery_v"]),

  // Messwerte aus POST /readings/batch (Firmware v7). Dauerhaft, idempotent über (device_id, seq).
  device_readings: defineTable({
    device_id: v.string(),
    // Besitzer zum Zeitpunkt des Empfangs.
    clerk_id: v.optional(v.string()),
    seq: v.number(),
    // Unix-Sekunden UTC. Bei time_synced: false ungenau, nicht für zeitkritische Auswertungen nutzen.
    measured_at: v.number(),
    time_synced: v.boolean(),
    // null: Feuchtesensor ausgefallen. Wird gespeichert, aber nicht ausgewertet.
    moisture_pct: v.union(v.number(), v.null()),
    moisture_raw: v.optional(v.number()),
    moisture_raw_min: v.optional(v.number()),
    moisture_raw_max: v.optional(v.number()),
    // true: Feuchtesensor unlesbar (moisture_raw == 0, Firmware sendet dann moisture_pct 0).
    // Gespeichert, aber nicht ausgewertet.
    moisture_sensor_error: v.optional(v.boolean()),
    // null: Sensor ausgefallen.
    temperature_c: v.optional(v.union(v.number(), v.null())),
    humidity_pct: v.optional(v.union(v.number(), v.null())),
    lux: v.optional(v.union(v.number(), v.null())),
    battery_v: v.optional(v.number()),
    charging: v.optional(v.boolean()),
    usb: v.optional(v.boolean()),
    fw_version: v.optional(v.string()),
    received_at: v.number(),
  })
    .index("by_device_and_seq", ["device_id", "seq"])
    .index("by_device_and_measured_at", ["device_id", "measured_at"]),

  // Befehlskanal Backend -> Gerät (Vertrag v7 Abschnitt 6). command_id ist die "id" im Vertrag (c_…).
  device_commands: defineTable({
    command_id: v.string(),
    device_id: v.string(),
    type: v.union(
      v.literal("measure_now"),
      v.literal("set_wifi"),
      v.literal("factory_reset"),
      v.literal("ota_now"),
      v.literal("set_config"),
    ),
    // set_wifi: ssid, password (password wird bei Ack, failed, Ablauf und Ersetzen gelöscht).
    // set_config: Felder aus sanitizeDeviceConfig. Sonst leer.
    params: v.object({
      ssid: v.optional(v.string()),
      password: v.optional(v.string()),
      settle_ms: v.optional(v.number()),
      samples: v.optional(v.number()),
      low_battery_v: v.optional(v.number()),
      critical_battery_v: v.optional(v.number()),
      online_poll_s: v.optional(v.number()),
    }),
    status: v.union(
      v.literal("pending"),
      v.literal("delivered"),
      v.literal("ok"),
      v.literal("failed"),
      v.literal("expired"),
    ),
    created_at: v.number(),
    expires_at: v.number(),
    delivered_at: v.optional(v.number()),
    acked_at: v.optional(v.number()),
    detail: v.optional(v.string()),
    created_by: v.optional(v.string()),
  })
    .index("by_device_and_status", ["device_id", "status"])
    .index("by_command_id", ["command_id"]),

  // OTA-Releases (Vertrag v7 Abschnitt 7). Neu angelegte Releases sind inaktiv mit rollout 0.
  // Aktivieren und Rollout setzen per Dashboard oder `npx convex run firmware:setReleaseRollout`.
  firmware_releases: defineTable({
    version: v.string(),
    hw_rev: v.string(),
    sha256: v.string(),
    size: v.number(),
    storage_id: v.id("_storage"),
    created_at: v.number(),
    active: v.boolean(),
    // Prozent 0–100 (stabiler Hash der device_id) oder explizite Liste von device_ids.
    rollout: v.union(v.number(), v.array(v.string())),
    // Rollback-Meldungen der Geräte (status.ota_rollback_version), je Gerät höchstens einmal gezählt.
    rollback_reports: v.optional(v.number()),
    rollback_device_ids: v.optional(v.array(v.string())),
  })
    .index("by_hw_rev_and_active", ["hw_rev", "active"])
    .index("by_hw_rev_and_version", ["hw_rev", "version"]),

  claim_tokens: defineTable({
    // SHA-256 (hex) des Claim-Tokens, den die App per BLE an das Gerät gibt.
    token_hash: v.string(),
    clerk_id: v.string(),
    expires_at: v.number(),
    used_at: v.optional(v.number()),
    device_id: v.optional(v.string()),
    created_at: v.number(),
  })
    .index("by_token_hash", ["token_hash"])
    .index("by_clerk_id", ["clerk_id"]),

  sensor_logs: defineTable({
    sensor_id: v.string(),
    cycle_timestamp: v.string(),
    boot_count: v.number(),
    battery_voltage: v.optional(v.number()),
    wifi_connect_ms: v.optional(v.number()),
    rtc_ok: v.boolean(),
    rtc_lost_power: v.boolean(),
    time_sync_ok: v.boolean(),
    sht40_ok: v.boolean(),
    bh1750_ok: v.boolean(),
    readings_sent: v.number(),
    readings_failed: v.number(),
    sleep_seconds: v.number(),
    next_wakeup: v.string(),
    errors: v.optional(v.string()),
    prev_error_flags: v.optional(v.number()),
    prev_wifi_fail_count: v.optional(v.number()),
    prev_http_fail_count: v.optional(v.number()),
    prev_last_good_hour: v.optional(v.number()),
    prev_readings_sent: v.optional(v.number()),
    prev_battery_voltage: v.optional(v.number()),
    created_at: v.number(),
  }).index("by_sensor_and_time", ["sensor_id", "created_at"]),

  sensor_sessions: defineTable({
    sensor_id: v.string(),
    date: v.string(),
    started_at: v.number(),
    readings_count: v.number(),
    status: v.union(
      v.literal("collecting"),
      v.literal("processed"),
      v.literal("failed"),
    ),
  }).index("by_sensor_and_started_at", ["sensor_id", "started_at"]),

  readings: defineTable({
    sensor_id: v.string(),
    session_id: v.optional(v.string()),
    moisture: v.number(),
    // Optional seit Firmware v7: fehlt, wenn der Sensor ausgefallen ist (temperature_c/lux null).
    temperature: v.optional(v.float64()),
    light_level: v.optional(v.number()),
    battery_voltage: v.optional(v.number()),
    timestamp: v.string(),
  })
    .index("by_session_id", ["session_id"])
    .index("by_sensor_and_date", ["sensor_id", "timestamp"])
    .index("by_timestamp", ["timestamp"]),

  plants: defineTable({
    device_id: v.optional(v.string()),
    sensor_id: v.optional(v.string()),
    clerk_id: v.optional(v.string()),
    species_id: v.optional(v.string()),
    character: v.optional(
      v.union(v.literal("happy"), v.literal("grumpy"), v.literal("neutral")),
    ),
    name: v.string(),
    consecutive_critical_days: v.optional(v.number()),
    last_critical_date: v.optional(v.string()),
    moisture_threshold: v.optional(v.number()),
    moisture_warning_threshold: v.optional(v.number()),
    temperature_threshold_min: v.optional(v.number()),
    temperature_threshold_max: v.optional(v.number()),
    light_threshold_min: v.optional(v.number()),
    light_threshold_max: v.optional(v.number()),
    created_at: v.number(),
  })
    .index("by_clerk_id", ["clerk_id"])
    .index("by_device_id", ["device_id"])
    .index("by_sensor_id", ["sensor_id"]),

  plant_species: defineTable({
    id: v.string(),
    name: v.string(),
    common_name: v.string(),
    moisture_critical: v.number(),
    moisture_warning: v.number(),
    temperature_min: v.number(),
    temperature_max: v.number(),
    light_min: v.number(),
    light_max: v.number(),
  })
    .index("by_species_id", ["id"])
    .index("by_common_name", ["common_name"]),

  session_summaries: defineTable({
    sensor_id: v.string(),
    session_id: v.id("sensor_sessions"),
    date: v.string(),
    moisture_median: v.number(),
    // Temperatur und Licht fehlen, wenn die Session keine gültigen Werte dafür hatte (Firmware v7).
    temperature_median: v.optional(v.number()),
    light_level_median: v.optional(v.number()),
    battery_voltage_median: v.optional(v.number()),
    moisture_state: v.union(
      v.literal("critical"),
      v.literal("warning"),
      v.literal("ok"),
    ),
    temperature_state: v.optional(
      v.union(
        v.literal("cold"),
        v.literal("ok"),
        v.literal("hot"),
      ),
    ),
    light_state: v.optional(
      v.union(
        v.literal("dark"),
        v.literal("ok"),
        v.literal("bright"),
      ),
    ),
    created_at: v.number(),
  })
    .index("by_session_id", ["session_id"])
    .index("by_sensor_and_date", ["sensor_id", "date"])
    .index("by_sensor_and_created_at", ["sensor_id", "created_at"]),

  messages: defineTable({
    clerk_id: v.string(),
    device_id: v.string(),
    plant_name: v.string(),
    type: v.union(v.literal("plant_message"), v.literal("system_message")),
    state: v.union(v.literal("ok"), v.literal("warning"), v.literal("critical")),
    text: v.string(),
    read: v.boolean(),
    created_at: v.number(),
  })
    .index("by_clerk_id", ["clerk_id"])
    .index("by_clerk_id_and_read", ["clerk_id", "read"]),
});