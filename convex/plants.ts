import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getPlantBySensorId = query({
  args: {
    sensor_id: v.string(),
  },
  handler: async (ctx, args) => {
    const plant = await ctx.db
      .query("plants")
      .filter((q) => q.eq(q.field("sensor_id"), args.sensor_id))
      .first();

    return plant;
  },
});

export const createPlant = mutation({
  args: {
    sensor_id: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const createdAt = Date.now();

    const id = await ctx.db.insert("plants", {
      sensor_id: args.sensor_id,
      name: args.name,
      created_at: createdAt,
    });

    return { ok: true, id };
  },
});

export const getLatestSummary = query({
  args: {
    sensor_id: v.string(),
  },
  handler: async (ctx, args) => {
    const summaries = await ctx.db
      .query("daily_summaries")
      .filter((q) => q.eq(q.field("sensor_id"), args.sensor_id))
      .collect();

    const latestSummary = summaries
      .slice()
      .sort((left, right) => right.created_at - left.created_at)[0] ?? null;

    return latestSummary;
  },
});