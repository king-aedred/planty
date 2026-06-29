import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

type PlantWithLatestSummary = Doc<"plants"> & {
  latestSummary: Doc<"daily_summaries"> | null;
};

async function getPlantsWithLatestSummaries(ctx: QueryCtx, clerkId: string): Promise<PlantWithLatestSummary[]> {
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
    const plants = (await ctx.db.query("plants").collect()) as Doc<"plants">[];

    return plants.find((plant) => plant.device_id === args.device_id || plant.sensor_id === args.device_id) ?? null;
  },
});

export const createPlant = mutation({
  args: {
    clerk_id: v.string(),
    device_id: v.optional(v.string()),
    name: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
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

export const removeSensorFromPlant = mutation({
  args: {
    plant_id: v.id("plants"),
  },
  handler: async (ctx: MutationCtx, args) => {
    const plant = await ctx.db.get(args.plant_id);

    if (!plant) {
      return null;
    }

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
    const summaries = (await ctx.db.query("daily_summaries").collect()) as Doc<"daily_summaries">[];

    return (
      summaries
        .filter((summary) => summary.sensor_id === args.device_id)
        .sort((left, right) => right.created_at - left.created_at)[0] ?? null
    );
  },
});