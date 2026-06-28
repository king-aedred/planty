import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getSensorByDeviceId = query({
  args: {
    device_id: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sensors")
      .withIndex("by_device_id", (q) => q.eq("device_id", args.device_id))
      .first();
  },
});

export const registerSensor = mutation({
  args: {
    device_id: v.string(),
  },
  handler: async (ctx, args) => {
    const existingSensor = await ctx.db
      .query("sensors")
      .withIndex("by_device_id", (q) => q.eq("device_id", args.device_id))
      .first();

    if (existingSensor) {
      return existingSensor._id;
    }

    const createdAt = Date.now();

    return await ctx.db.insert("sensors", {
      device_id: args.device_id,
      firmware_version: undefined,
      last_seen: createdAt,
      created_at: createdAt,
    });
  },
});

export const updateLastSeen = mutation({
  args: {
    device_id: v.string(),
  },
  handler: async (ctx, args) => {
    const sensor = await ctx.db
      .query("sensors")
      .withIndex("by_device_id", (q) => q.eq("device_id", args.device_id))
      .first();

    if (!sensor) {
      return;
    }

    await ctx.db.patch(sensor._id, {
      last_seen: Date.now(),
    });
  },
});