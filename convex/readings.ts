import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getReadingsBySensorAndDate = query({
  args: {
    sensor_id: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const readings = await ctx.db
      .query("readings")
      .withIndex("by_sensor_and_date", (q) =>
        q
          .eq("sensor_id", args.sensor_id)
          .gte("timestamp", args.date)
          .lt("timestamp", `${args.date}\uffff`),
      )
      .collect()

    return readings.filter((reading) => reading.timestamp.startsWith(args.date))
  },
})

export const getSensorsWithReadingsToday = query({
  args: {
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const readings = await ctx.db
      .query("readings")
      .withIndex("by_timestamp", (q) =>
        q.gte("timestamp", args.date).lt("timestamp", `${args.date}\uffff`),
      )
      .collect()

    const sensorIds = new Set<string>()

    for (const reading of readings) {
      if (reading.timestamp.startsWith(args.date)) {
        sensorIds.add(reading.sensor_id)
      }
    }

    const sensorIdsWithoutSummary: string[] = []

    for (const sensorId of sensorIds) {
      const summary = await ctx.db
        .query("daily_summaries")
        .withIndex("by_sensor_and_date", (q) =>
          q.eq("sensor_id", sensorId).eq("date", args.date),
        )
        .first()

      if (!summary) {
        sensorIdsWithoutSummary.push(sensorId)
      }
    }

    return sensorIdsWithoutSummary
  },
})

export const getSummaryBySensorAndDate = query({
  args: {
    sensor_id: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const summary = await ctx.db
      .query("daily_summaries")
      .withIndex("by_sensor_and_date", (q) =>
        q.eq("sensor_id", args.sensor_id).eq("date", args.date),
      )
      .first()

    return summary
  },
})

export const createDailySummary = mutation({
  args: {
    sensor_id: v.string(),
    date: v.string(),
    moisture_median: v.number(),
    temperature_median: v.number(),
    light_level_median: v.number(),
    moisture_state: v.union(
      v.literal("critical"),
      v.literal("low"),
      v.literal("ok"),
    ),
    temperature_state: v.union(
      v.literal("cold"),
      v.literal("ok"),
      v.literal("hot"),
    ),
    light_state: v.union(
      v.literal("dark"),
      v.literal("ok"),
      v.literal("bright"),
    ),
  },
  handler: async (ctx, args) => {
    const createdAt = Date.now()

    const id = await ctx.db.insert("daily_summaries", {
      sensor_id: args.sensor_id,
      date: args.date,
      moisture_median: args.moisture_median,
      temperature_median: args.temperature_median,
      light_level_median: args.light_level_median,
      moisture_state: args.moisture_state,
      temperature_state: args.temperature_state,
      light_state: args.light_state,
      created_at: createdAt,
    })

    return { ok: true, id }
  },
})

export const deleteReadingsBySensorAndDate = mutation({
  args: {
    sensor_id: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const readings = await ctx.db
      .query("readings")
      .withIndex("by_sensor_and_date", (q) =>
        q
          .eq("sensor_id", args.sensor_id)
          .gte("timestamp", args.date)
          .lt("timestamp", `${args.date}\uffff`),
      )
      .collect()

    const readingsToDelete = readings.filter((reading) =>
      reading.timestamp.startsWith(args.date),
    )

    for (const reading of readingsToDelete) {
      await ctx.db.delete(reading._id)
    }

    return { ok: true, deleted: readingsToDelete.length }
  },
})