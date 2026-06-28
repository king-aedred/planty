import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getPlantsByClerkId = query({
  args: {
    clerk_id: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("plants")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerk_id))
      .collect();
  },
});

export const getPlantByDeviceId = query({
  args: {
    device_id: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("plants")
      .withIndex("by_device_id", (q) => q.eq("device_id", args.device_id))
      .first();
  },
});

export const createPlant = mutation({
  args: {
    clerk_id: v.string(),
    device_id: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const existingPlant = await ctx.db
      .query("plants")
      .withIndex("by_device_id", (q) => q.eq("device_id", args.device_id))
      .first();

    if (existingPlant) {
      throw new Error("Sensor already registered");
    }

    return await ctx.db.insert("plants", {
      clerk_id: args.clerk_id,
      device_id: args.device_id,
      name: args.name,
      created_at: Date.now(),
    });
  },
});

export const getLatestSummary = query({
  args: {
    device_id: v.string(),
  },
  handler: async (ctx, args) => {
    const summaries = await ctx.db
      .query("daily_summaries")
      .filter((q) => q.eq(q.field("sensor_id"), args.device_id))
      .collect();

    return summaries.slice().sort((left, right) => right.created_at - left.created_at)[0] ?? null;
  },
});