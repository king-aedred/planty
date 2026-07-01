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

const UTC_DAY_MS = 24 * 60 * 60 * 1000;

const formatUtcTime = (timestamp: number) => {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(timestamp));
};

const formatUtcRelativeDate = (timestamp: number) => {
  const now = new Date();
  const seenDate = new Date(timestamp);

  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const seenUtc = Date.UTC(seenDate.getUTCFullYear(), seenDate.getUTCMonth(), seenDate.getUTCDate());
  const dayDiff = Math.max(0, Math.floor((nowUtc - seenUtc) / UTC_DAY_MS));

  if (dayDiff === 0) {
    return `heute ${formatUtcTime(timestamp)}`;
  }

  if (dayDiff === 1) {
    return `gestern ${formatUtcTime(timestamp)}`;
  }

  if (dayDiff < 14) {
    return `vor ${dayDiff} Tagen`;
  }

  const weeks = Math.max(1, Math.floor(dayDiff / 7));
  return `vor ${weeks} Wochen`;
};

export const getSensorStatus = query({
  args: {
    device_id: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuthenticatedUser(ctx);
    const plants = await ctx.db.query("plants").collect();
    const ownsSensor = plants.some(
      (plant) =>
        (plant.device_id === args.device_id || plant.sensor_id === args.device_id) &&
        plant.clerk_id === identity.subject,
    );

    if (!ownsSensor) {
      throw new Error("Unauthorized");
    }

    const sensor = await ctx.db
      .query("sensors")
      .withIndex("by_device_id", (q) => q.eq("device_id", args.device_id))
      .first();

    if (!sensor || typeof sensor.last_seen !== "number") {
      return {
        status: "unknown" as const,
        last_seen: null,
        last_seen_formatted: "unbekannt",
      };
    }

    const ageMs = Date.now() - sensor.last_seen;
    const status = ageMs < 48 * 60 * 60 * 1000 ? "active" : ageMs <= 7 * UTC_DAY_MS ? "inactive" : "offline";

    return {
      status,
      last_seen: sensor.last_seen,
      last_seen_formatted: formatUtcRelativeDate(sensor.last_seen),
    };
  },
});

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