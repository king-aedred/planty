import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

const requireAuthenticatedUser = async (ctx: QueryCtx | MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Unauthorized");
  }

  return identity;
};

export const getSensorByDeviceId = query({
  args: {
    device_id: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuthenticatedUser(ctx);
    const sensor = await ctx.db
      .query("sensors")
      .withIndex("by_device_id", (q) => q.eq("device_id", args.device_id))
      .first();

    if (!sensor) {
      return null;
    }

    const plants = await ctx.db.query("plants").collect();
    const ownsSensor = plants.some(
      (plant) => (plant.device_id === args.device_id || plant.sensor_id === args.device_id) && plant.clerk_id === identity.subject,
    );

    return ownsSensor ? sensor : null;
  },
});

export const registerSensor = mutation({
  args: {
    device_id: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);

    const existingSensor = await ctx.db
      .query("sensors")
      .withIndex("by_device_id", (q) => q.eq("device_id", args.device_id))
      .first();

    if (existingSensor) {
      throw new Error("Sensor already registered");
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
    // Intentionally unauthenticated: this mutation is called by the public HTTP ingestion route.
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