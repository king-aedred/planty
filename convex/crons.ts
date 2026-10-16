import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Offline- und Akku-Hinweise (Vertrag v7 Abschnitt 9), siehe convex/sensor_alerts.ts.
crons.interval("sensor alerts", { minutes: 15 }, internal.sensor_alerts.checkSensorAlerts, {});

export default crons;
