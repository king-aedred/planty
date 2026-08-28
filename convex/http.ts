import { httpRouter } from "convex/server";
import { httpAction, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

const http = httpRouter()

export const createSensorLog = mutation({
    args: {
        sensor_id: v.string(),
        cycle_timestamp: v.string(),
        boot_count: v.number(),
        battery_voltage: v.optional(v.number()),
        wifi_connect_ms: v.optional(v.number()),
        rtc_ok: v.boolean(),
        rtc_lost_power: v.boolean(),
        time_sync_ok: v.boolean(),
        sht40_ok: v.boolean(),
        bh1750_ok: v.boolean(),
        readings_sent: v.number(),
        readings_failed: v.number(),
        sleep_seconds: v.number(),
        next_wakeup: v.string(),
        errors: v.optional(v.string()),
        prev_error_flags: v.optional(v.number()),
        prev_wifi_fail_count: v.optional(v.number()),
        prev_http_fail_count: v.optional(v.number()),
        prev_last_good_hour: v.optional(v.number()),
        prev_readings_sent: v.optional(v.number()),
        prev_battery_voltage: v.optional(v.number()),
        created_at: v.number(),
    },
    handler: async (ctx, args) => {
        const id = await ctx.db.insert("sensor_logs", args)

        return { ok: true, id }
    },
})

export const getSensorLogsBySensor = query({
    args: {
        sensor_id: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("sensor_logs")
            .withIndex("by_sensor_and_time", (q) => q.eq("sensor_id", args.sensor_id))
            .order("desc")
            .take(20)
    },
})

export const createReading = mutation({
    args: {
        sensor_id: v.string(),
        session_id: v.optional(v.id("sensor_sessions")),
        moisture: v.number(),
        temperature: v.number(),
        light_level: v.number(),
        battery_voltage: v.optional(v.number()),
        timestamp: v.string(),
    },
    handler: async (ctx, args) => {
        const id = await ctx.db.insert("readings", {
            sensor_id: args.sensor_id,
            session_id: args.session_id,
            moisture: args.moisture,
            temperature: args.temperature,
            light_level: args.light_level,
            battery_voltage: args.battery_voltage,
            timestamp: args.timestamp,
        })

        return { ok: true, id }
    },
})

export const hello = mutation({
    args: {
        device_id: v.string(),
        timestamp: v.string(),
    },
    handler: async (ctx, args) => {
        const now = Date.now()
        const sensor = await ctx.db
            .query("sensors")
            .withIndex("by_device_id", (q) => q.eq("device_id", args.device_id))
            .first()

        if (sensor) {
            await ctx.db.patch(sensor._id, {
                last_seen: now,
                status: "active",
            })
            return { ok: true, device_id: args.device_id }
        }

        await ctx.db.insert("sensors", {
            device_id: args.device_id,
            last_seen: now,
            created_at: now,
            status: "active",
        })

        return { ok: true, device_id: args.device_id }
    },
})

export const getReadings = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("readings").collect()
    },
})

function isSensorLogBody(
    value: unknown,
): value is {
    sensor_id: string
    cycle_timestamp: string
    boot_count: number
    battery_voltage?: number
    wifi_connect_ms?: number
    rtc_ok: boolean
    rtc_lost_power: boolean
    time_sync_ok: boolean
    sht40_ok: boolean
    bh1750_ok: boolean
    readings_sent: number
    readings_failed: number
    sleep_seconds: number
    next_wakeup: string
    errors?: string
    prev_error_flags?: number
    prev_wifi_fail_count?: number
    prev_http_fail_count?: number
    prev_last_good_hour?: number
    prev_readings_sent?: number
    prev_battery_voltage?: number
} {
  if (typeof value !== "object" || value === null) {
    return false
  }

  const body = value as Record<string, unknown>

  return (
    typeof body.sensor_id === "string" &&
    typeof body.cycle_timestamp === "string" &&
    typeof body.boot_count === "number" && Number.isFinite(body.boot_count) &&
    (body.battery_voltage === undefined || (typeof body.battery_voltage === "number" && Number.isFinite(body.battery_voltage))) &&
    (body.wifi_connect_ms === undefined || (typeof body.wifi_connect_ms === "number" && Number.isFinite(body.wifi_connect_ms))) &&
    typeof body.rtc_ok === "boolean" &&
    typeof body.rtc_lost_power === "boolean" &&
    typeof body.time_sync_ok === "boolean" &&
    typeof body.sht40_ok === "boolean" &&
    typeof body.bh1750_ok === "boolean" &&
    typeof body.readings_sent === "number" && Number.isFinite(body.readings_sent) &&
    typeof body.readings_failed === "number" && Number.isFinite(body.readings_failed) &&
    typeof body.sleep_seconds === "number" && Number.isFinite(body.sleep_seconds) &&
    typeof body.next_wakeup === "string" &&
    (body.errors === undefined || typeof body.errors === "string") &&
    (body.prev_error_flags === undefined || (typeof body.prev_error_flags === "number" && Number.isFinite(body.prev_error_flags))) &&
    (body.prev_wifi_fail_count === undefined || (typeof body.prev_wifi_fail_count === "number" && Number.isFinite(body.prev_wifi_fail_count))) &&
    (body.prev_http_fail_count === undefined || (typeof body.prev_http_fail_count === "number" && Number.isFinite(body.prev_http_fail_count))) &&
    (body.prev_last_good_hour === undefined || (typeof body.prev_last_good_hour === "number" && Number.isFinite(body.prev_last_good_hour))) &&
    (body.prev_readings_sent === undefined || (typeof body.prev_readings_sent === "number" && Number.isFinite(body.prev_readings_sent))) &&
    (body.prev_battery_voltage === undefined || (typeof body.prev_battery_voltage === "number" && Number.isFinite(body.prev_battery_voltage)))
  )
}

function isHelloBody(
    value: unknown,
): value is {
    device_id: string
    timestamp: string
} {
    if (typeof value !== "object" || value === null) {
        return false
    }

    const body = value as Record<string, unknown>
    return (
        typeof body.device_id === "string" &&
        body.device_id.length > 0 &&
        body.device_id.length <= 64 &&
        typeof body.timestamp === "string" &&
        body.timestamp.length > 0 &&
        body.timestamp.length <= 64
    )
}

http.route({
    path: "/hello",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        try {
            const body: unknown = await request.json()

            if (!isHelloBody(body)) {
                return new Response(JSON.stringify({ error: "Request body must contain device_id and timestamp" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                })
            }

            const result = await ctx.runMutation(api.http.hello, body)
            return new Response(JSON.stringify(result), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        } catch {
            return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            })
        }
    }),
})

http.route({
    path: "/logs",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        try {
            const body: unknown = await request.json()

            if (!isSensorLogBody(body)) {
                return new Response(
                    JSON.stringify({
                        error: "Request body must contain sensor_id and sensor log fields",
                    }),
                    {
                        status: 400,
                        headers: { "Content-Type": "application/json" },
                    },
                )
            }

            const result = await ctx.runMutation(api.http.createSensorLog, {
                ...body,
                created_at: Date.now(),
            })

            return new Response(JSON.stringify({ ok: true, id: result.id }), {
                status: 201,
                headers: { "Content-Type": "application/json" },
            })
        } catch {
            return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            })
        }
    }),
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

            const sensorDate = body.timestamp.substring(0, 10)
            const serverDate = new Date().toISOString().substring(0, 10)

            if (Math.abs(daysBetween(sensorDate, serverDate)) > 1) {
                console.warn("[convex/http] reading date differs from server date", {
                    sensor_date: sensorDate,
                    server_date: serverDate,
                })
            }

            const session = await ctx.runMutation(api.readings.getOrCreateSession, {
                sensor_id: body.sensor_id,
                date: sensorDate,
                backend_secret: process.env.BACKEND_SECRET ?? '',
            }) as { _id: string } | null

            if (!session) {
                throw new Error('Failed to create or load session')
            }

            const sessionId = session._id as Id<"sensor_sessions">

            const result = await ctx.runMutation(api.http.createReading, {
                ...body,
                session_id: sessionId,
            })

            const readingsCount = await ctx.runMutation(api.readings.incrementSessionReadings, {
                session_id: sessionId,
                backend_secret: process.env.BACKEND_SECRET ?? '',
            })

            if (readingsCount === 18) {
                await ctx.runAction(internal.readings.triggerProcessSession, {
                    session_id: sessionId,
                    sensor_id: body.sensor_id,
                    date: sensorDate,
                    reason: 'complete',
                })
            }

            if (readingsCount === 1) {
                await ctx.scheduler.runAfter(4 * 60 * 1000, internal.readings.scheduleSessionCheck, {
                    session_id: sessionId,
                    check_type: 'timeout_12',
                })

                await ctx.scheduler.runAfter(8 * 60 * 1000, internal.readings.scheduleSessionCheck, {
                    session_id: sessionId,
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