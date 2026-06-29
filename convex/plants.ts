import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

type PlantWithLatestSummary = Doc<"plants"> & {
  latestSummary: Doc<"daily_summaries"> | null;
};

const requireSelf = async (ctx: QueryCtx | MutationCtx, clerkId: string) => {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity || identity.subject !== clerkId) {
    throw new Error("Unauthorized");
  }
};

async function getPlantsWithLatestSummaries(ctx: QueryCtx, clerkId: string): Promise<PlantWithLatestSummary[]> {
  await requireSelf(ctx, clerkId);

  const plants = (await ctx.db.query("plants").collect()) as Doc<"plants">[];
  const summaries = (await ctx.db.query("daily_summaries").collect()) as Doc<"daily_summaries">[];

  const latestSummaryBySensor = new Map<string, Doc<"daily_summaries">>();

  for (const summary of summaries) {
    const currentLatest = latestSummaryBySensor.get(summary.sensor_id);

    if (!currentLatest || summary.created_at > currentLatest.created_at) {
      latestSummaryBySensor.set(summary.sensor_id, summary);
    }
  }

  return plants
    .filter((plant) => plant.clerk_id === clerkId)
    .map((plant) => {
      const sensorId = plant.device_id ?? plant.sensor_id;

      return {
        ...plant,
        latestSummary: sensorId ? latestSummaryBySensor.get(sensorId) ?? null : null,
      };
    });
}

export const getPlantsByClerkId = query({
  args: {
    clerk_id: v.string(),
  },
  handler: async (ctx, args) => {
    return await getPlantsWithLatestSummaries(ctx, args.clerk_id);
  },
});

export const getAllPlantsByClerkId = query({
  args: {
    clerk_id: v.string(),
  },
  handler: async (ctx, args) => {
    return await getPlantsWithLatestSummaries(ctx, args.clerk_id);
  },
});

export const getPlantByDeviceId = query({
  args: {
    device_id: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const plant = (await ctx.db.query("plants").collect()) as Doc<"plants">[];
    const matchedPlant = plant.find((entry) => entry.device_id === args.device_id || entry.sensor_id === args.device_id) ?? null;

    if (!identity || !matchedPlant || matchedPlant.clerk_id !== identity.subject) {
      return null;
    }

    return matchedPlant;
  },
});

export const createPlant = mutation({
  args: {
    clerk_id: v.string(),
    device_id: v.optional(v.string()),
    name: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    await requireSelf(ctx, args.clerk_id);

    if (args.device_id) {
      const plants = (await ctx.db.query("plants").collect()) as Doc<"plants">[];
      const duplicatePlant = plants.find(
        (plant) => plant.device_id === args.device_id || plant.sensor_id === args.device_id,
      );

      if (duplicatePlant) {
        throw new Error("Sensor already registered");
      }
    }

    return await ctx.db.insert("plants", {
      clerk_id: args.clerk_id,
      name: args.name,
      created_at: Date.now(),
      ...(args.device_id
        ? {
            device_id: args.device_id,
            sensor_id: args.device_id,
          }
        : {}),
    });
  },
});

export const updatePlantSettings = mutation({
  args: {
    plant_id: v.id("plants"),
    settings: v.object({
      name: v.string(),
      moisture_threshold: v.optional(v.number()),
      temperature_threshold_min: v.optional(v.number()),
      temperature_threshold_max: v.optional(v.number()),
      light_threshold_min: v.optional(v.number()),
      light_threshold_max: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const plant = await ctx.db.get(args.plant_id);

    if (!plant) {
      return null;
    }

    await requireSelf(ctx, plant.clerk_id ?? "");

    await ctx.db.patch(args.plant_id, {
      name: args.settings.name,
      moisture_threshold: args.settings.moisture_threshold,
      temperature_threshold_min: args.settings.temperature_threshold_min,
      temperature_threshold_max: args.settings.temperature_threshold_max,
      light_threshold_min: args.settings.light_threshold_min,
      light_threshold_max: args.settings.light_threshold_max,
    });

    return args.plant_id;
  },
});

export const removeSensorFromPlant = mutation({
  args: {
    plant_id: v.id("plants"),
  },
  handler: async (ctx: MutationCtx, args) => {
    const plant = await ctx.db.get(args.plant_id);

    if (!plant) {
      return null;
    }

    await requireSelf(ctx, plant.clerk_id ?? "");

    await ctx.db.patch(args.plant_id, {
      device_id: undefined,
      sensor_id: undefined,
    });

    return args.plant_id;
  },
});

export const deletePlant = mutation({
  args: {
    plant_id: v.id("plants"),
  },
  handler: async (ctx: MutationCtx, args) => {
    const plant = await ctx.db.get(args.plant_id);

    if (!plant) {
      return null;
    }

    await requireSelf(ctx, plant.clerk_id ?? "");

    await ctx.db.delete(args.plant_id);

    return args.plant_id;
  },
});

export const transferSensor = mutation({
  args: {
    from_plant_id: v.id("plants"),
    to_plant_id: v.id("plants"),
    device_id: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    const fromPlant = await ctx.db.get(args.from_plant_id);
    const toPlant = await ctx.db.get(args.to_plant_id);

    if (!fromPlant || !toPlant) {
      return null;
    }

    await requireSelf(ctx, fromPlant.clerk_id ?? "");
    await requireSelf(ctx, toPlant.clerk_id ?? "");

    await ctx.db.patch(args.from_plant_id, {
      device_id: undefined,
      sensor_id: undefined,
    });

    await ctx.db.patch(args.to_plant_id, {
      device_id: args.device_id,
      sensor_id: args.device_id,
    });

    return {
      from_plant_id: args.from_plant_id,
      to_plant_id: args.to_plant_id,
      device_id: args.device_id,
    };
  },
});

export const getLatestSummary = query({
  args: {
    device_id: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return null;
    }

    const plants = (await ctx.db.query("plants").collect()) as Doc<"plants">[];
    const ownedPlant = plants.find((entry) => entry.device_id === args.device_id || entry.sensor_id === args.device_id);

    if (!ownedPlant || ownedPlant.clerk_id !== identity.subject) {
      return null;
    }

    const summaries = (await ctx.db.query("daily_summaries").collect()) as Doc<"daily_summaries">[];

    return (
      summaries
        .filter((summary) => summary.sensor_id === args.device_id)
        .sort((left, right) => right.created_at - left.created_at)[0] ?? null
    );
  },
});