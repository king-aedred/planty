import { httpRouter } from "convex/server";
import { httpAction, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";

const http = httpRouter()

export const createReading = mutation({
    args: {
        sensor_id: v.string(),
        moisture: v.number(),
        temperature: v.number(),
        light_level: v.number(),
        battery_voltage: v.optional(v.number()),
        timestamp: v.string(),
    },
    handler: async (ctx, args) => {
        const id = await ctx.db.insert("readings", {
            sensor_id: args.sensor_id,
            moisture: args.moisture,
            temperature: args.temperature,
            light_level: args.light_level,
            battery_voltage: args.battery_voltage,
            timestamp: args.timestamp,
        })

        return { ok: true, id }
    },
})

export const getReadings = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("readings").collect()
    },
})

// überprüft ob es sich tatsächlich um einen Reader Body handelt, wenn ja ist der rückgabewert entsprehen value is ...
function isReadingBody(
    value: unknown,
): value is {
    sensor_id: string
    moisture: number
    temperature: number
    light_level: number
    battery_voltage?: number
    timestamp: string
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  
  const body = value as Record<string, unknown>

  return (
    typeof body.sensor_id === "string" &&
    typeof body.moisture === "number" &&
    Number.isFinite(body.moisture) &&
    typeof body.temperature === "number" &&
    Number.isFinite(body.temperature) &&
    typeof body.light_level === "number" &&
    Number.isFinite(body.light_level) &&
        (body.battery_voltage === undefined || (typeof body.battery_voltage === "number" && Number.isFinite(body.battery_voltage))) &&
    typeof body.timestamp === "string"
  )
}

http.route({ //reagiert auf POSTs auf /readings
    path: "/readings",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        try {
            const body: unknown = await request.json();

            if (
                !isReadingBody(body) ||
                body.moisture < 0 ||
                body.moisture > 100
            ) {
                return new Response(
                    JSON.stringify({
                        error:
                          "Request body must contain sensor_id, moisture (0-100), temperature, light_level, and timestamp",
                    }),
                    {
                        status: 400,
                        headers: { "Content-Type": "application/json" },
                    },
                )
            }

            const result = await ctx.runMutation(api.http.createReading, body)
            const sensorDate = body.timestamp.substring(0, 10)
            const serverDate = new Date().toISOString().substring(0, 10)

            if (Math.abs(daysBetween(sensorDate, serverDate)) > 1) {
                console.warn("[convex/http] reading date differs from server date", {
                    sensor_date: sensorDate,
                    server_date: serverDate,
                })
            }

            await ctx.runMutation(api.readings.getOrCreateSession, {
                sensor_id: body.sensor_id,
                date: sensorDate,
                backend_secret: process.env.BACKEND_SECRET ?? '',
            })

            const readingsCount = await ctx.runMutation(api.readings.incrementSessionReadings, {
                sensor_id: body.sensor_id,
                date: sensorDate,
                backend_secret: process.env.BACKEND_SECRET ?? '',
            })

            if (readingsCount === 18) {
                const internalWebhookSecret = process.env.INTERNAL_WEBHOOK_SECRET

                if (!internalWebhookSecret) {
                    throw new Error("Missing INTERNAL_WEBHOOK_SECRET")
                }

                await fetch(process.env.BACKEND_PROCESS_URL ?? 'http://localhost:3000/process-session', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${internalWebhookSecret}`,
                    },
                    body: JSON.stringify({
                        sensor_id: body.sensor_id,
                        date: sensorDate,
                        reason: 'complete',
                    }),
                })
            }

            if (readingsCount === 1) {
                await ctx.scheduler.runAfter(4 * 60 * 1000, internal.readings.scheduleSessionCheck, {
                    sensor_id: body.sensor_id,
                    date: sensorDate,
                    check_type: 'timeout_12',
                })

                await ctx.scheduler.runAfter(8 * 60 * 1000, internal.readings.scheduleSessionCheck, {
                    sensor_id: body.sensor_id,
                    date: sensorDate,
                    check_type: 'timeout_failed',
                })
            }

            await ctx.runMutation(api.sensors.updateLastSeen, {
                device_id: body.sensor_id,
                backend_secret: process.env.BACKEND_SECRET ?? '',
            })

            return new Response(JSON.stringify(result), {
                status: 201,
                headers: { "Content-Type": "application/json" }
            })
        } catch {
            return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            })
        }
    })
})

http.route({
    path: "/readings",
    method: "GET",
    handler: httpAction(async (ctx) => {
        const readings = await ctx.runQuery(api.http.getReadings, {})

        return new Response(JSON.stringify(readings), {
           status: 200,
           headers: { "Content-Type": "application/json" },  
        })
    }),
})

const daysBetween = (leftDate: string, rightDate: string): number => {
    const left = new Date(`${leftDate}T00:00:00.000Z`).getTime()
    const right = new Date(`${rightDate}T00:00:00.000Z`).getTime()

    return Math.round((left - right) / (24 * 60 * 60 * 1000))
}

export default http;