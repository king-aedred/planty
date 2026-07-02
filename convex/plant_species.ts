import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";

const plantSpeciesSeedSchema = v.object({
  id: v.string(),
  name: v.string(),
  common_name: v.string(),
  moisture_critical: v.number(),
  moisture_warning: v.number(),
  temperature_min: v.number(),
  temperature_max: v.number(),
  light_min: v.number(),
  light_max: v.number(),
});

export type PlantSpeciesSeed = {
  id: string;
  name: string;
  common_name: string;
  moisture_critical: number;
  moisture_warning: number;
  temperature_min: number;
  temperature_max: number;
  light_min: number;
  light_max: number;
};

export const seedPlantSpeciesEntries = async (
  ctx: MutationCtx,
  speciesEntries: readonly PlantSpeciesSeed[],
): Promise<{ inserted: number; skipped: number }> => {
  let inserted = 0;
  let skipped = 0;

  for (const species of speciesEntries) {
    const existingSpecies = await ctx.db
      .query("plant_species")
      .withIndex("by_species_id", (q) => q.eq("id", species.id))
      .first();

    if (existingSpecies) {
      skipped += 1;
      continue;
    }

    await ctx.db.insert("plant_species", species);
    inserted += 1;
  }

  return { inserted, skipped };
};

export const searchPlantSpecies = query({
  args: {
    search: v.string(),
  },
  handler: async (ctx, args) => {
    const search = args.search.trim().toLowerCase();
    const species = (await ctx.db.query("plant_species").collect()) as Doc<"plant_species">[];

    if (!search) {
      return species.slice(0, 20);
    }

    return species
      .filter((entry) => {
        return entry.common_name.toLowerCase().includes(search) || entry.name.toLowerCase().includes(search);
      })
      .slice(0, 20);
  },
});

export const getPlantSpeciesById = query({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.query("plant_species").withIndex("by_species_id", (q) => q.eq("id", args.id)).first();
  },
});

export const seedPlantSpecies = mutation({
  args: {
    species: v.array(plantSpeciesSeedSchema),
  },
  handler: async (ctx, args) => {
    return await seedPlantSpeciesEntries(ctx, args.species);
  },
});