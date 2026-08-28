import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

const sensorStatusValue = v.union(
  v.literal("active"),
  v.literal("offline"),
  v.literal("charging"),
  v.literal("needs_remeasurement"),
  v.literal("measuring"),
);

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
    timeZone: "Europe/Berlin",
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
    const sensor = await ctx.db
      .query("sensors")
      .withIndex("by_device_id", (q) => q.eq("device_id", args.device_id))
      .first();

    if (!sensor) {
      return {
        status: "unknown" as const,
        last_seen: null,
        last_seen_formatted: "unbekannt",
      };
    }

    if (sensor.clerk_id !== identity.subject) {
      throw new Error("Unauthorized");
    }

    if (typeof sensor.last_seen !== "number") {
      return {
        status: "unknown" as const,
        last_seen: null,
        last_seen_formatted: "unbekannt",
      };
    }

    if (sensor.status === "needs_remeasurement") {
      return {
        status: "needs_remeasurement" as const,
        last_seen: sensor.last_seen,
        last_seen_formatted: formatUtcRelativeDate(sensor.last_seen),
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

    return sensor.clerk_id === identity.subject ? sensor : null;
  },
});

export const isDeviceOnline = query({
  args: {
    device_id: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);

    const sensor = await ctx.db
      .query("sensors")
      .withIndex("by_device_id", (q) => q.eq("device_id", args.device_id))
      .first();

    return {
      found: sensor !== null,
      last_seen: sensor?.last_seen ?? null,
    };
  },
});

export const getSensorsByClerkId = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAuthenticatedUser(ctx);
    const sensors = await ctx.db
      .query("sensors")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .collect();
    const plants = await ctx.db.query("plants").collect();

    return sensors.map((sensor) => ({
      ...sensor,
      has_plant: plants.some(
        (plant) => plant.device_id === sensor.device_id || plant.sensor_id === sensor.device_id,
      ),
    }));
  },
});

export const claimSensor = mutation({
  args: {
    device_id: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuthenticatedUser(ctx);

    const existingSensor = await ctx.db
      .query("sensors")
      .withIndex("by_device_id", (q) => q.eq("device_id", args.device_id))
      .first();

    if (!existingSensor) {
      throw new Error("Sensor wurde noch nicht online gesehen");
    }

    if (existingSensor.clerk_id && existingSensor.clerk_id !== identity.subject) {
      throw new Error("Sensor gehört bereits einem anderen User");
    }

    if (existingSensor.clerk_id === identity.subject) {
      return existingSensor._id;
    }

    await ctx.db.patch(existingSensor._id, {
      clerk_id: identity.subject,
      claimed_at: Date.now(),
    });

    // TODO Sicherheit: Aktuell kann jeder eingeloggte User jede noch freie device_id claimen. IDs sind aus der MAC abgeleitet und damit erratbar. Später: Claim-Secret, das das Gerät per BLE ausliefert, gegen device_credentials prüfen (siehe docs/planty_projektbeschreibung.md §7).
    return existingSensor._id;
  },
});

export const updateLastSeen = mutation({
  args: {
    device_id: v.string(),
    backend_secret: v.string(),
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.BACKEND_SECRET

    if (!expectedSecret || args.backend_secret !== expectedSecret) {
      throw new Error("Unauthorized: invalid backend secret")
    }

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

export const setSensorStatus = mutation({
  args: {
    device_id: v.string(),
    status: sensorStatusValue,
    backend_secret: v.string(),
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.BACKEND_SECRET

    if (!expectedSecret || args.backend_secret !== expectedSecret) {
      throw new Error("Unauthorized: invalid backend secret")
    }

    const sensor = await ctx.db
      .query("sensors")
      .withIndex("by_device_id", (q) => q.eq("device_id", args.device_id))
      .first();

    if (!sensor) {
      return { found: false } as const;
    }

    await ctx.db.patch(sensor._id, {
      status: args.status,
    });

    return { found: true } as const;
  },
});