import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  readings: defineTable({
    sensor_id: v.string(),
    moisture: v.number(),
    timestamp: v.string(),
  }),
});
