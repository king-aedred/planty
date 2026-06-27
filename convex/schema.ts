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
});
