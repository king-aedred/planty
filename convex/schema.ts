import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerk_id: v.string(),
    email: v.string(),
    plan: v.string(),
    is_dev: v.boolean(),
    notification_push: v.optional(v.boolean()),
    notification_telegram: v.optional(v.boolean()),
    notification_planty_messenger: v.optional(v.boolean()),
    notification_call: v.optional(v.boolean()),
    contact_window_start: v.optional(v.float64()),
    contact_window_end: v.optional(v.float64()),
    measure_time: v.optional(v.string()),
    phone_number: v.optional(v.string()),
    telegram_chat_id: v.optional(v.string()),
    telegram_connect_code: v.optional(v.string()),
    created_at: v.number(),
  }).index("by_clerk_id", ["clerk_id"]),

  sensors: defineTable({
    device_id: v.string(),
    firmware_version: v.optional(v.string()),
    last_seen: v.number(),
    created_at: v.number(),
  }).index("by_device_id", ["device_id"]),

  readings: defineTable({
    sensor_id: v.string(),
    moisture: v.number(),
    temperature: v.float64(),
    light_level: v.number(),
    timestamp: v.string(),
  })
    .index("by_sensor_and_date", ["sensor_id", "timestamp"])
    .index("by_timestamp", ["timestamp"]),

  plants: defineTable({
    device_id: v.optional(v.string()),
    sensor_id: v.optional(v.string()),
    clerk_id: v.optional(v.string()),
    name: v.string(),
    moisture_threshold: v.optional(v.number()),
    temperature_threshold_min: v.optional(v.number()),
    temperature_threshold_max: v.optional(v.number()),
    light_threshold_min: v.optional(v.number()),
    light_threshold_max: v.optional(v.number()),
    created_at: v.number(),
  })
    .index("by_clerk_id", ["clerk_id"])
    .index("by_device_id", ["device_id"])
    .index("by_sensor_id", ["sensor_id"]),

  daily_summaries: defineTable({
    sensor_id: v.string(),
    date: v.string(),
    moisture_median: v.number(),
    temperature_median: v.number(),
    light_level_median: v.number(),
    moisture_state: v.union(
      v.literal("critical"),
      v.literal("low"),
      v.literal("ok"),
    ),
    temperature_state: v.union(
      v.literal("cold"),
      v.literal("ok"),
      v.literal("hot"),
    ),
    light_state: v.union(
      v.literal("dark"),
      v.literal("ok"),
      v.literal("bright"),
    ),
    created_at: v.number(),
  }).index("by_sensor_and_date", ["sensor_id", "date"]),
});