#!/usr/bin/env node
// Lädt eine Firmware-.bin hoch und legt einen INAKTIVEN Release an (Vertrag v7 Abschnitt 7).
//
//   FIRMWARE_ADMIN_SECRET=… node scripts/publish_firmware.mjs <datei.bin> <version> <hw_rev> [--site <url>]
//
// - Das Secret kommt nur aus der Umgebung, nie aus einer Datei im Repo. Es muss mit der
//   Convex-Umgebungsvariable FIRMWARE_ADMIN_SECRET übereinstimmen (`npx convex env set FIRMWARE_ADMIN_SECRET`).
// - Site-URL: --site, sonst CONVEX_SITE_URL, sonst die Dev-Deployment.
// - sha256 und Größe werden hier berechnet und vom Backend nachgeprüft.
// - Aktivieren und Rollout danach, z. B.:
//   npx convex run firmware:setReleaseRollout '{"version":"7.0.1","hw_rev":"v3","active":true,"rollout":["cg-00A5D8"]}'

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const DEFAULT_SITE = "https://dusty-shrimp-80.eu-west-1.convex.site";

const args = process.argv.slice(2);
const siteFlag = args.indexOf("--site");
const site = (siteFlag >= 0 ? args.splice(siteFlag, 2)[1] : process.env.CONVEX_SITE_URL) ?? DEFAULT_SITE;
const [file, version, hwRev] = args;

if (!file || !version || !hwRev) {
  console.error("Aufruf: FIRMWARE_ADMIN_SECRET=… node scripts/publish_firmware.mjs <datei.bin> <version> <hw_rev> [--site <url>]");
  process.exit(2);
}

const secret = process.env.FIRMWARE_ADMIN_SECRET;
if (!secret) {
  console.error("FIRMWARE_ADMIN_SECRET ist nicht gesetzt.");
  process.exit(2);
}

const bytes = await readFile(file);
const sha256 = createHash("sha256").update(bytes).digest("hex");
console.log(`Datei: ${file}\nGröße: ${bytes.length} Bytes\nsha256: ${sha256}\nZiel: ${site} (${version}, ${hwRev})`);

const response = await fetch(`${site}/firmware/admin/releases`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/octet-stream",
    "X-Firmware-Version": version,
    "X-Firmware-Hw-Rev": hwRev,
    "X-Firmware-Sha256": sha256,
  },
  body: bytes,
});

const text = await response.text();
console.log(`HTTP ${response.status}: ${text}`);
process.exit(response.status === 201 ? 0 : 1);
