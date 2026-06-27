import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  readings: defineTable({
    sensor_id: v.string(),
    moisture: v.number(),
    temperature: v.float64(),
    light_level: v.number(),
    timestamp: v.string(),
  }),

  plants: defineTable({
    sensor_id: v.string(),
    name: v.string(),
    created_at: v.number(),
  }),

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
  }),
});