# Planty Dev Mode Error Report

## Problem Statement

The mobile Dev Mode screen cannot load backend data or trigger the cron job. The visible failure is:

- `Kein erreichbarer Dev-Server gefunden`
- probes to `http://10.0.2.2:3000` and `http://100.86.32.59:3000`
- `AbortError: Aborted`
- on Android: `Network request failed`

The immediate impact is that Dev Mode cannot read `/dev/info`, cannot simulate sensor scenarios, and cannot trigger the cron endpoint.

## Current Symptom Pattern

Observed behavior on the device:

1. The app opens the Dev Mode screen.
2. The screen probes multiple backend URLs.
3. All probes fail with network-level errors or aborts.
4. The UI reports that no reachable dev server was found.

This is different from an application-level `403 forbidden` response. A `403` means the backend was reached and rejected the request. `AbortError` / `Network request failed` means the request did not complete at the transport layer.

## Current Implementation

### Mobile Dev Mode

File: `mobile/app/(home)/devmode.tsx`

Current behavior:

- resolves the backend base URL by probing candidates in order:
  - `EXPO_PUBLIC_DEV_SERVER_URL`
  - `http://10.0.2.2:3000` on Android, otherwise `http://localhost:3000`
  - `http://100.86.32.59:3000`
- stores probe attempts in the UI for debugging
- loads `/dev/info` once a reachable base URL is found
- sends `POST /dev/simulate` with `{ device_id, scenario }`
- sends `POST /dev/trigger-cron`
- attaches `x-clerk-id` to authenticated dev requests

Important detail:

- the Dev Mode screen only works if the backend is actually reachable from the current Android environment
- the screen now exposes probe attempts and the selected server URL

### Backend Dev Routes

File: `backend/src/routes/devmode.ts`

Current endpoints:

- `GET /dev/info`
- `POST /dev/simulate`
- `POST /dev/trigger-cron`

Important details:

- all dev routes require a `x-clerk-id` header
- authorization is checked by `convex.query(api.users.isDevUser, { clerk_id })`
- route handlers log the Clerk ID and dev-user status
- `/dev/simulate` writes generated readings into Convex and may trigger processing
- `/dev/trigger-cron` runs the cron job once

### Backend Server Binding

File: `backend/src/index.ts`

Current behavior:

- Hono server serves on port `3000`
- hostname is set to `0.0.0.0`
- dev router is mounted under `/dev`

This means the backend should be reachable from the host and from the LAN, provided the network path is correct.

### Android Cleartext Configuration

File: `mobile/app.json`

Current behavior:

- `expo-build-properties` is used to enable `android.usesCleartextTraffic: true`
- this is required because the dev backend is served over plain HTTP

Important operational detail:

- this change only takes effect in a rebuilt development client
- if the installed dev client predates this configuration, Android may still block HTTP traffic

## What Is Known So Far

1. The backend process is listening on port `3000`.
2. Requests to the backend from the host return a response.
3. The dev routes themselves are present and require the Clerk header.
4. The mobile app is currently probing multiple URLs and failing before it can complete a request.
5. The failure signature is transport-level, not a backend authorization response.

## Most Likely Root Causes

Ranked by probability:

1. The Android dev client was built before the cleartext HTTP change and still blocks plain HTTP.
2. The device used for testing cannot route to the selected backend address.
3. The emulator/device mismatch means `10.0.2.2` or the Tailscale IP is not the correct route for this run.
4. A VPN, firewall, or network policy prevents access to the backend host.

## Important Distinction

There are two different classes of failure that have appeared during debugging:

- `403 forbidden`: backend reached, Clerk auth header missing or user not allowed
- `AbortError` / `Network request failed`: backend not reached reliably from Android

The current issue belongs to the second class.

## Suggested Next Technical Check

The next most useful validation is:

1. confirm the exact Android environment being used
2. rebuild the dev client after any cleartext configuration change
3. test one known-good URL from the device environment, not only from the host

If the app is running on an emulator, `10.0.2.2:3000` should be the first candidate to validate. If it is a physical device, the LAN or Tailscale IP must be reachable from that device.

## Files Involved

- `mobile/app/(home)/devmode.tsx`
- `mobile/app.json`
- `backend/src/routes/devmode.ts`
- `backend/src/index.ts`
- `backend/src/config.ts`

## Short Summary

The backend implementation itself is present and the server is listening, but the Android client cannot reliably reach it over HTTP. The remaining work is to verify the device networking path and ensure the installed dev client was rebuilt after the cleartext HTTP change.