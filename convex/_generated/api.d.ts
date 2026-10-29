/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as battery from "../battery.js";
import type * as crons from "../crons.js";
import type * as device_commands from "../device_commands.js";
import type * as device_readings from "../device_readings.js";
import type * as devices from "../devices.js";
import type * as firmware from "../firmware.js";
import type * as http from "../http.js";
import type * as messages from "../messages.js";
import type * as migrations from "../migrations.js";
import type * as plant_species from "../plant_species.js";
import type * as plants from "../plants.js";
import type * as readings from "../readings.js";
import type * as seed_plants from "../seed_plants.js";
import type * as sensor_alerts from "../sensor_alerts.js";
import type * as sensors from "../sensors.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  battery: typeof battery;
  crons: typeof crons;
  device_commands: typeof device_commands;
  device_readings: typeof device_readings;
  devices: typeof devices;
  firmware: typeof firmware;
  http: typeof http;
  messages: typeof messages;
  migrations: typeof migrations;
  plant_species: typeof plant_species;
  plants: typeof plants;
  readings: typeof readings;
  seed_plants: typeof seed_plants;
  sensor_alerts: typeof sensor_alerts;
  sensors: typeof sensors;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
