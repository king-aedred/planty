import { httpAction, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { DEVICE_ID_PATTERN, jsonResponse } from "./devices";

// OTA-Auslieferung nach Vertrag Firmware v7 Abschnitt 7.
// - GET /firmware/latest?hw_rev=&fw_version=&device_id= -> 204 oder 200 {version, url, sha256, size}
// - GET /firmware/file/<version>?hw_rev=<hw_rev> -> .bin aus Convex Storage, gleicher Host wie die API
//   (*.convex.site, Zertifikatskette GTS Root R4), damit die Firmware keiner weiteren Kette vertrauen muss.
// - POST /firmware/admin/releases -> Upload (Bearer FIRMWARE_ADMIN_SECRET), legt Release inaktiv an.

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]{1,32}))?$/;
const HW_REV_PATTERN = /^[A-Za-z0-9._-]{1,16}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
// Großzügig über der OTA-Partition eines ESP32-C3 (ca. 1,5–2 MB), deutlich unter der HTTP-Grenze.
const MAX_FIRMWARE_BYTES = 4 * 1024 * 1024;

type Semver = { major: number; minor: number; patch: number; prerelease: string | null };

export const parseSemver = (value: string): Semver | null => {
  const match = SEMVER_PATTERN.exec(value);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] ?? null };
};

// Vereinfachte Semver-Ordnung: Vorabversion < Release; Vorabversionen untereinander lexikografisch.
const compareSemver = (left: Semver, right: Semver) => {
  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease < right.prerelease ? -1 : 1;
};

// Stabiler Bucket 0–99 aus der device_id (FNV-1a 32 Bit). Gleiche Geräte bekommen bei jedem
// Release als Erste das Update; ein höherer Prozentsatz schließt die früheren Geräte immer ein.
const rolloutBucket = (deviceId: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < deviceId.length; index += 1) {
    hash ^= deviceId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
};

const isInRollout = (release: Doc<"firmware_releases">, deviceId: string) =>
  Array.isArray(release.rollout)
    ? release.rollout.includes(deviceId)
    : rolloutBucket(deviceId) < Math.max(0, Math.min(100, release.rollout));

const fileUrl = (release: Doc<"firmware_releases">) =>
  `${process.env.CONVEX_SITE_URL}/firmware/file/${encodeURIComponent(release.version)}?hw_rev=${encodeURIComponent(release.hw_rev)}`;

export type OtaOffer = { version: string; url: string; sha256: string; size: number };

// Höchste aktive Version für diese hw_rev, die neuer ist als fw_version und das Gerät im Rollout hat.
// Gemeinsam genutzt von GET /firmware/latest und POST /readings/batch (Feld "ota").
export const findOtaOffer = async (
  ctx: QueryCtx | MutationCtx,
  args: { hw_rev: string; fw_version: string; device_id: string },
): Promise<OtaOffer | null> => {
  const current = parseSemver(args.fw_version);
  if (!current) return null;

  const releases = await ctx.db
    .query("firmware_releases")
    .withIndex("by_hw_rev_and_active", (q) => q.eq("hw_rev", args.hw_rev).eq("active", true))
    .collect();

  let best: { release: Doc<"firmware_releases">; semver: Semver } | null = null;
  for (const release of releases) {
    const semver = parseSemver(release.version);
    if (!semver || compareSemver(semver, current) <= 0 || !isInRollout(release, args.device_id)) continue;
    if (!best || compareSemver(semver, best.semver) > 0) best = { release, semver };
  }

  if (!best) return null;
  return { version: best.release.version, url: fileUrl(best.release), sha256: best.release.sha256, size: best.release.size };
};

// Ab so vielen Rollback-Meldungen (verschiedene Geräte) wird ein Release automatisch deaktiviert.
// Env FIRMWARE_ROLLBACK_THRESHOLD (ganze Zahl >= 1), Standard 1.
const DEFAULT_ROLLBACK_THRESHOLD = 1;
const rollbackThreshold = () => {
  const parsed = Number(process.env.FIRMWARE_ROLLBACK_THRESHOLD);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : DEFAULT_ROLLBACK_THRESHOLD;
};

// Verbucht eine Rollback-Meldung (status.ota_rollback_version aus /readings/batch). Je Gerät zählt
// ein Release nur einmal, auch wenn das Gerät die Meldung in jedem Batch wiederholt.
export const recordOtaRollback = async (
  ctx: MutationCtx,
  args: { version: string; hw_rev: string; device_id: string },
) => {
  const release = await ctx.db
    .query("firmware_releases")
    .withIndex("by_hw_rev_and_version", (q) => q.eq("hw_rev", args.hw_rev).eq("version", args.version))
    .first();
  if (!release) return;

  const reporters = release.rollback_device_ids ?? [];
  if (reporters.includes(args.device_id)) return;

  const reports = (release.rollback_reports ?? 0) + 1;
  const deactivate = release.active && reports >= rollbackThreshold();
  await ctx.db.patch(release._id, {
    rollback_reports: reports,
    rollback_device_ids: [...reporters, args.device_id],
    ...(deactivate ? { active: false } : {}),
  });
  console.warn("[firmware] OTA rollback reported", {
    version: args.version,
    hw_rev: args.hw_rev,
    device_id: args.device_id,
    reports,
    deactivated: deactivate,
  });
};

export const getOtaOffer = internalQuery({
  args: { hw_rev: v.string(), fw_version: v.string(), device_id: v.string() },
  handler: async (ctx, args) => await findOtaOffer(ctx, args),
});

export const getReleaseFile = internalQuery({
  args: { version: v.string(), hw_rev: v.string() },
  handler: async (ctx, args) => {
    const release = await ctx.db
      .query("firmware_releases")
      .withIndex("by_hw_rev_and_version", (q) => q.eq("hw_rev", args.hw_rev).eq("version", args.version))
      .first();
    // Nur aktive Releases sind abrufbar.
    if (!release || !release.active) return null;
    return { storage_id: release.storage_id, size: release.size, sha256: release.sha256 };
  },
});

export const createRelease = internalMutation({
  args: {
    version: v.string(),
    hw_rev: v.string(),
    sha256: v.string(),
    size: v.number(),
    storage_id: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("firmware_releases")
      .withIndex("by_hw_rev_and_version", (q) => q.eq("hw_rev", args.hw_rev).eq("version", args.version))
      .first();
    if (existing) {
      return { ok: false } as const;
    }
    await ctx.db.insert("firmware_releases", { ...args, created_at: Date.now(), active: false, rollout: 0 });
    return { ok: true } as const;
  },
});

// Aktivieren und Rollout setzen, z. B.:
//   npx convex run firmware:setReleaseRollout '{"version":"7.0.1","hw_rev":"v3","active":true,"rollout":10}'
//   npx convex run firmware:setReleaseRollout '{"version":"7.0.1","hw_rev":"v3","active":true,"rollout":["cg-00A5D8"]}'
export const setReleaseRollout = internalMutation({
  args: {
    version: v.string(),
    hw_rev: v.string(),
    active: v.boolean(),
    rollout: v.union(v.number(), v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const release = await ctx.db
      .query("firmware_releases")
      .withIndex("by_hw_rev_and_version", (q) => q.eq("hw_rev", args.hw_rev).eq("version", args.version))
      .first();
    if (!release) {
      throw new Error("Release not found");
    }
    if (typeof args.rollout === "number" && (!Number.isFinite(args.rollout) || args.rollout < 0 || args.rollout > 100)) {
      throw new Error("Rollout percent must be between 0 and 100");
    }
    if (Array.isArray(args.rollout) && args.rollout.some((deviceId) => !DEVICE_ID_PATTERN.test(deviceId))) {
      throw new Error("Invalid device_id in rollout list");
    }
    await ctx.db.patch(release._id, { active: args.active, rollout: args.rollout });
    return { ok: true } as const;
  },
});

// GET /firmware/latest. Kein Header nötig; 400 bei ungültigen Parametern.
export const firmwareLatestHttp = httpAction(async (ctx, request) => {
  const params = new URL(request.url).searchParams;
  const hwRev = params.get("hw_rev") ?? "";
  const fwVersion = params.get("fw_version") ?? "";
  const deviceId = params.get("device_id") ?? "";
  if (!HW_REV_PATTERN.test(hwRev) || !parseSemver(fwVersion) || !DEVICE_ID_PATTERN.test(deviceId)) {
    return jsonResponse(400, { error: "invalid_parameters" });
  }

  try {
    const offer = await ctx.runQuery(internal.firmware.getOtaOffer, { hw_rev: hwRev, fw_version: fwVersion, device_id: deviceId });
    return offer ? jsonResponse(200, offer) : new Response(null, { status: 204 });
  } catch (error) {
    console.error("[firmware/latest] failed", { device_id: deviceId, error: String(error) });
    return jsonResponse(500, { error: "internal_error" });
  }
});

// GET /firmware/file/<version>?hw_rev=<hw_rev>. Liefert die .bin mit Content-Length und application/octet-stream.
export const firmwareFileHttp = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const version = decodeURIComponent(url.pathname.slice("/firmware/file/".length));
  const hwRev = url.searchParams.get("hw_rev") ?? "";
  if (!parseSemver(version) || !HW_REV_PATTERN.test(hwRev)) {
    return jsonResponse(400, { error: "invalid_parameters" });
  }

  const release = await ctx.runQuery(internal.firmware.getReleaseFile, { version, hw_rev: hwRev });
  if (!release) {
    return jsonResponse(404, { error: "not_found" });
  }
  const blob = await ctx.storage.get(release.storage_id);
  if (!blob) {
    return jsonResponse(404, { error: "not_found" });
  }

  return new Response(blob, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(blob.size),
      "Cache-Control": "no-store",
    },
  });
});

// Konstante Laufzeit beim Vergleich des Admin-Secrets.
const safeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
};

// POST /firmware/admin/releases (siehe scripts/publish_firmware.mjs).
// Header: Authorization: Bearer <FIRMWARE_ADMIN_SECRET>, X-Firmware-Version, X-Firmware-Hw-Rev, X-Firmware-Sha256.
// Body: die .bin. sha256 und Größe werden serverseitig nachgerechnet; der Release startet inaktiv mit rollout 0.
export const firmwareAdminUploadHttp = httpAction(async (ctx, request) => {
  const secret = process.env.FIRMWARE_ADMIN_SECRET;
  if (!secret) {
    return jsonResponse(503, { error: "admin_not_configured" });
  }
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!safeEqual(token, secret)) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  const version = request.headers.get("X-Firmware-Version") ?? "";
  const hwRev = request.headers.get("X-Firmware-Hw-Rev") ?? "";
  const expectedSha = (request.headers.get("X-Firmware-Sha256") ?? "").toLowerCase();
  if (!parseSemver(version) || !HW_REV_PATTERN.test(hwRev) || !SHA256_PATTERN.test(expectedSha)) {
    return jsonResponse(400, { error: "invalid_parameters" });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_FIRMWARE_BYTES) {
    return jsonResponse(400, { error: "invalid_size" });
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const actualSha = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actualSha !== expectedSha) {
    return jsonResponse(400, { error: "sha256_mismatch" });
  }

  const storageId = await ctx.storage.store(new Blob([bytes], { type: "application/octet-stream" }));
  const result = await ctx.runMutation(internal.firmware.createRelease, {
    version,
    hw_rev: hwRev,
    sha256: actualSha,
    size: bytes.length,
    storage_id: storageId,
  });
  if (!result.ok) {
    await ctx.storage.delete(storageId);
    return jsonResponse(409, { error: "release_exists" });
  }

  return jsonResponse(201, { version, hw_rev: hwRev, sha256: actualSha, size: bytes.length, active: false, rollout: 0 });
});
