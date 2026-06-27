import { httpRouter } from "convex/server";
import { httpAction, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

export const createReading = mutation({
  args: {
    sensor_id: v.string(),
    moisture: v.number(),
    temperature: v.float64(),
    light_level: v.number(),
    timestamp: v.string(),
  },
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.moisture) || args.moisture < 0 || args.moisture > 100) {
      throw new Error("moisture must be a number between 0 and 100");
    }

    const id = await ctx.db.insert("readings", {
      sensor_id: args.sensor_id,
      moisture: args.moisture,
      temperature: args.temperature,
      light_level: args.light_level,
      timestamp: args.timestamp,
    });

    return { ok: true, id };
  },
});

export const getReadings = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("readings").collect();
  },
});

const http = httpRouter();

function isReadingBody(
  value: unknown,
): value is {
  sensor_id: string;
  moisture: number;
  temperature: number;
  light_level: number;
  timestamp: string;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const body = value as Record<string, unknown>;

  return (
    typeof body.sensor_id === "string" &&
    typeof body.moisture === "number" &&
    Number.isFinite(body.moisture) &&
    typeof body.temperature === "number" &&
    Number.isFinite(body.temperature) &&
    typeof body.light_level === "number" &&
    Number.isFinite(body.light_level) &&
    typeof body.timestamp === "string"
  );
}

http.route({
  path: "/readings",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body: unknown = await request.json();

      if (!isReadingBody(body) || body.moisture < 0 || body.moisture > 100) {
        return new Response(
          JSON.stringify({
            error:
              "Request body must contain sensor_id, moisture (0-100), temperature, light_level, and timestamp",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const result = await ctx.runMutation(api.http.createReading, body);

      return new Response(JSON.stringify(result), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

http.route({
  path: "/readings",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const readings = await ctx.runQuery(api.http.getReadings, {});

    return new Response(JSON.stringify(readings), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;