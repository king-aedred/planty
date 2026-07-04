import { internalAction, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";

const requireBackendSecret = (backendSecret: string) => {
  const expectedSecret = process.env.BACKEND_SECRET

  if (!expectedSecret || backendSecret !== expectedSecret) {
    throw new Error("Unauthorized: invalid backend secret")
  }
}

export const getReadingsBySensorAndDate = query({
  args: {
    sensor_id: v.string(),
    date: v.string(),
    backend_secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireBackendSecret(args.backend_secret)

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

export const getOrCreateSession = mutation({
  args: {
    sensor_id: v.string(),
    date: v.string(),
    backend_secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireBackendSecret(args.backend_secret)

    const existingSession = await ctx.db
      .query("sensor_sessions")
      .withIndex("by_sensor_and_date", (q) =>
        q.eq("sensor_id", args.sensor_id).eq("date", args.date),
      )
      .first()

    if (existingSession) {
      return existingSession
    }

    const startedAt = Date.now()

    const id = await ctx.db.insert("sensor_sessions", {
      sensor_id: args.sensor_id,
      date: args.date,
      started_at: startedAt,
      readings_count: 0,
      status: "collecting",
    })

    return await ctx.db.get(id)
  },
})

export const incrementSessionReadings = mutation({
  args: {
    sensor_id: v.string(),
    date: v.string(),
    backend_secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireBackendSecret(args.backend_secret)

    const session = await ctx.db
      .query("sensor_sessions")
      .withIndex("by_sensor_and_date", (q) =>
        q.eq("sensor_id", args.sensor_id).eq("date", args.date),
      )
      .first()

    if (!session) {
      const id = await ctx.db.insert("sensor_sessions", {
        sensor_id: args.sensor_id,
        date: args.date,
        started_at: Date.now(),
        readings_count: 1,
        status: "collecting",
      })

      return (await ctx.db.get(id))?.readings_count ?? 1
    }

    const newReadingsCount = session.readings_count + 1

    await ctx.db.patch(session._id, {
      readings_count: newReadingsCount,
    })

    return newReadingsCount
  },
})

export const getSession = query({
  args: {
    sensor_id: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sensor_sessions")
      .withIndex("by_sensor_and_date", (q) =>
        q.eq("sensor_id", args.sensor_id).eq("date", args.date),
      )
      .first()
  },
})

export const markSessionProcessed = mutation({
  args: {
    sensor_id: v.string(),
    date: v.string(),
    backend_secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireBackendSecret(args.backend_secret)

    const session = await ctx.db
      .query("sensor_sessions")
      .withIndex("by_sensor_and_date", (q) =>
        q.eq("sensor_id", args.sensor_id).eq("date", args.date),
      )
      .first()

    if (!session) {
      return null
    }

    await ctx.db.patch(session._id, {
      status: "processed",
    })

    return {
      ...session,
      status: "processed" as const,
    }
  },
})

export const markSessionFailed = mutation({
  args: {
    sensor_id: v.string(),
    date: v.string(),
    backend_secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireBackendSecret(args.backend_secret)

    const session = await ctx.db
      .query("sensor_sessions")
      .withIndex("by_sensor_and_date", (q) =>
        q.eq("sensor_id", args.sensor_id).eq("date", args.date),
      )
      .first()

    if (!session) {
      return null
    }

    await ctx.db.patch(session._id, {
      status: "failed",
    })

    return {
      ...session,
      status: "failed" as const,
    }
  },
})

export const scheduleSessionCheck = internalAction({
  args: {
    sensor_id: v.string(),
    date: v.string(),
    check_type: v.union(v.literal("timeout_12"), v.literal("timeout_failed")),
  },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(api.readings.getSession, {
      sensor_id: args.sensor_id,
      date: args.date,
    })

    if (!session || session.status === "processed") {
      return
    }

    const backendProcessUrl = process.env.BACKEND_PROCESS_URL
    const backendSensorProblemUrl = process.env.BACKEND_SENSOR_PROBLEM_URL
    const internalWebhookSecret = process.env.INTERNAL_WEBHOOK_SECRET
    const sensorWebhookSecret = process.env.SENSOR_WEBHOOK_SECRET

    if (args.check_type === "timeout_12") {
      if (session.readings_count >= 12) {
        if (!backendProcessUrl || !internalWebhookSecret) {
          throw new Error("Missing backend process webhook configuration")
        }

        await fetch(backendProcessUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${internalWebhookSecret}`,
          },
          body: JSON.stringify({
            sensor_id: args.sensor_id,
            date: args.date,
            reason: "partial_12",
          }),
        })
      }

      return
    }

    if (session.readings_count < 12) {
      if (!backendSensorProblemUrl || !sensorWebhookSecret) {
        throw new Error("Missing sensor problem webhook configuration")
      }

      try {
        await fetch(backendSensorProblemUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sensorWebhookSecret}`,
          },
          body: JSON.stringify({
            device_id: args.sensor_id,
            reason: "max_retries_exceeded",
          }),
        })
      } finally {
        await ctx.runMutation(api.readings.markSessionFailed, {
          sensor_id: args.sensor_id,
          date: args.date,
          backend_secret: process.env.BACKEND_SECRET ?? "",
        })
      }
    }
  },
})

export const getSensorsWithReadingsToday = query({
  args: {
    date: v.string(),
    backend_secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireBackendSecret(args.backend_secret)

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

export const getSensorIdsWithReadingsToday = query({
  args: {
    date: v.string(),
    backend_secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireBackendSecret(args.backend_secret)

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

    return Array.from(sensorIds)
  },
})

export const getSummaryBySensorAndDate = query({
  args: {
    sensor_id: v.string(),
    date: v.string(),
    backend_secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireBackendSecret(args.backend_secret)

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
    battery_voltage_median: v.optional(v.number()),
    moisture_state: v.union(
      v.literal("critical"),
      v.literal("warning"),
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
    backend_secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireBackendSecret(args.backend_secret)

    const createdAt = Date.now()

    const id = await ctx.db.insert("daily_summaries", {
      sensor_id: args.sensor_id,
      date: args.date,
      moisture_median: args.moisture_median,
      temperature_median: args.temperature_median,
      light_level_median: args.light_level_median,
      ...(args.battery_voltage_median === undefined
        ? {}
        : { battery_voltage_median: args.battery_voltage_median }),
      moisture_state: args.moisture_state,
      temperature_state: args.temperature_state,
      light_state: args.light_state,
      created_at: createdAt,
    })

    return { ok: true, id }
  },
})

export const createDailySummaryDirect = mutation({
  args: {
    device_id: v.string(),
    date: v.string(),
    moisture_median: v.number(),
    temperature_median: v.number(),
    light_level_median: v.number(),
    moisture_state: v.union(
      v.literal("critical"),
      v.literal("warning"),
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
    created_at: v.number(),
    backend_secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireBackendSecret(args.backend_secret)

    const existingSummary = await ctx.db
      .query("daily_summaries")
      .withIndex("by_sensor_and_date", (q) =>
        q.eq("sensor_id", args.device_id).eq("date", args.date),
      )
      .first()

    if (existingSummary) {
      await ctx.db.delete(existingSummary._id)
    }

    const id = await ctx.db.insert("daily_summaries", {
      sensor_id: args.device_id,
      date: args.date,
      moisture_median: args.moisture_median,
      temperature_median: args.temperature_median,
      light_level_median: args.light_level_median,
      moisture_state: args.moisture_state,
      temperature_state: args.temperature_state,
      light_state: args.light_state,
      created_at: args.created_at,
    })

    return { ok: true, id, replaced: Boolean(existingSummary) }
  },
})

export const deleteDailySummaryBySensorAndDate = mutation({
  args: {
    sensor_id: v.string(),
    date: v.string(),
    backend_secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireBackendSecret(args.backend_secret)

    const summary = await ctx.db
      .query("daily_summaries")
      .withIndex("by_sensor_and_date", (q) =>
        q.eq("sensor_id", args.sensor_id).eq("date", args.date),
      )
      .first()

    if (!summary) {
      return { ok: true, deleted: false }
    }

    await ctx.db.delete(summary._id)

    return { ok: true, deleted: true }
  },
})

export const deleteReadingsBySensorAndDate = mutation({
  args: {
    sensor_id: v.string(),
    date: v.string(),
    backend_secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireBackendSecret(args.backend_secret)

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