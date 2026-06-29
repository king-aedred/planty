# Planty – Code Report Phase 3

_Stand: 2026-06-28 | Erstellt auf Basis vollständiger Codebase-Analyse_

---

## 1. Projektübersicht

Planty ist eine IoT-Pflanzenmessungsapp, die Sensordaten (Feuchtigkeit, Temperatur, Licht) aggregiert und auf einem Mobilgerät anzeigt.
Die App besteht aus drei Schichten: Convex als serverless Backend-as-a-Service, einem Node.js-Prozessor-Backend (Hono) und einer React Native / Expo Mobile-App mit Clerk-Authentifizierung.
Sensoren (real oder via `fake_sensor.py`) senden Rohwerte per HTTP POST direkt an Convex; das Backend berechnet täglich Medienwerte und klassifiziert den Pflanzenzustand.
Ein Dev Mode ermöglicht es Entwicklern mit dem `is_dev`-Flag, Testszenarien über die App auszulösen und den CronJob manuell zu triggern.
Die gesamte Infrastruktur läuft gegen eine einzelne Convex-Deployment-Instanz (`dusty-shrimp-80.eu-west-1`); eine Produktionsumgebungstrennung existiert noch nicht.

---

## 2. Systemarchitektur

```
┌─────────────────────────────────────────────────────────────────────┐
│  DATENQUELLEN                                                       │
│                                                                     │
│  fake_sensor.py ──────────────────────────────────────────────┐    │
│  (Python, 18 Readings, timespec="hours")                      │    │
│                                                                │    │
│  Dev Mode Simulate ────────────────────────────────────────┐  │    │
│  (mobile/app/(home)/devmode.tsx → POST /dev/simulate)      │  │    │
│  8 Szenarien: normal/minimal/insufficient/                 │  │    │
│  all_critical/all_ok/all_warning/duplicate/offline         │  │    │
└────────────────────────────────────────────────────────────┼──┼────┘
                                                             │  │
                                                             ▼  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CONVEX (BaaS) – dusty-shrimp-80.eu-west-1.convex.site             │
│                                                                     │
│  HTTP Endpoint:  POST /readings                                     │
│  ← isReadingBody() Validierung (kein Auth!)                        │
│  → ctx.runMutation(api.http.createReading)                         │
│                                                                     │
│  Tabellen:                                                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  users          sensors       readings       plants          │  │
│  │  clerk_id       device_id     sensor_id      device_id       │  │
│  │  email          last_seen     moisture       sensor_id (dup) │  │
│  │  plan           fw_version*   temperature    clerk_id        │  │
│  │  is_dev         created_at    light_level    name            │  │
│  │  created_at                   timestamp                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  daily_summaries                                             │  │
│  │  sensor_id, date, moisture_median, temperature_median,       │  │
│  │  light_level_median, moisture_state, temperature_state,      │  │
│  │  light_state, created_at                                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  * fw_version nie befüllt; last_seen nie aktualisiert              │
└─────────────────────────────────────────────────────────────────────┘
                    ▲                          ▲
                    │ ConvexHttpClient          │ ConvexReactClient
                    │ (backend)                 │ (mobile, Realtime)
┌───────────────────┴──────────────┐  ┌────────┴──────────────────────┐
│  NODE.JS BACKEND (Hono, Port 3000)│  │  MOBILE APP (Expo / RN)       │
│                                   │  │                               │
│  src/index.ts                     │  │  app/_layout.tsx              │
│  ├─ GET /                         │  │  ├─ ClerkProvider             │
│  ├─ GET /api/status/:id/:date     │  │  └─ ConvexProvider            │
│  └─ /dev/*  devModeRouter         │  │                               │
│                                   │  │  app/index.tsx                │
│  routes/devmode.ts                │  │  └─ Auth-Guard → Redirect     │
│  ├─ GET  /dev/info                │  │                               │
│  ├─ POST /dev/simulate            │  │  (auth)/sign-in.tsx           │
│  └─ POST /dev/trigger-cron        │  │  (auth)/sign-up.tsx           │
│     ↓ requireDevUser(clerkId)     │  │                               │
│       x-clerk-id Header (unverif.)│  │  (home)/index.tsx             │
│                                   │  │  ├─ createUser (auto)         │
│  jobs/cronJob.ts                  │  │  └─ Redirect → status/onboard │
│  └─ node-cron (1min dev/60min std)│  │                               │
│     ↓ runCronJobOnce()            │  │  (home)/onboarding.tsx        │
│       getSensorsWithReadingsToday │  │  ├─ registerSensor            │
│       processSessionIfReady()     │  │  └─ createPlant               │
│                                   │  │                               │
│  lib/processor.ts                 │  │  (home)/status.tsx            │
│  ├─ MIN_READINGS_REQUIRED (12)    │  │  ├─ getLatestSummary          │
│  ├─ calculateMedian()             │  │  └─ MetricCard ×3             │
│  ├─ classify states               │  │                               │
│  ├─ createDailySummary            │  │  (home)/devmode.tsx           │
│  └─ deleteReadingsBySensorAndDate │  │  ├─ Server-Probe (auto)       │
│                                   │  │  ├─ sendScenario()            │
│  lib/analysis.ts                  │  │  └─ triggerCron()             │
│  ├─ getMoistureState(<20=crit,    │  │                               │
│  │                  ≤40=low,ok)   │  │  components/burger-menu.tsx   │
│  ├─ getTemperatureState(<15=cold, │  │  ├─ Animated slide panel      │
│  │                     ≤28=ok,hot)│  │  └─ isDevUser → DevTools link │
│  └─ getLightState(<200=dark,      │  │                               │
│                   ≤800=ok,bright) │  └───────────────────────────────┘
└────────────────────────────────────┘

DATENFLUSS (Happy Path):
fake_sensor.py  →  POST /readings (Convex HTTP)
                →  readings Tabelle (18 Einträge, heute)
                →  CronJob (jede 60min / manuell)
                →  processSessionIfReady()
                →  ≥12 Readings? → Median berechnen
                →  createDailySummary (Convex)
                →  deleteReadingsBySensorAndDate (Convex)
                →  Mobile: getLatestSummary (Realtime Query)
                →  Status Screen: MetricCards mit Badge
```

---

## 3. Datei-Inventar

### Convex (BaaS Layer)

| Pfad | Aufgabe | Status |
|------|---------|--------|
| `convex/schema.ts` | Tabellendefinitionen: users, sensors, readings, plants, daily_summaries | ✅ fertig |
| `convex/http.ts` | HTTP-Endpunkt POST/GET /readings; isReadingBody-Validierung; createReading mutation | ✅ fertig |
| `convex/readings.ts` | CRUD für readings + daily_summaries; getSensorsWithReadingsToday; processSession-Queries | ✅ fertig |
| `convex/plants.ts` | CRUD für plants; getLatestSummary (lädt alle, sortiert in Memory) | ⚠️ halbfertig |
| `convex/sensors.ts` | registerSensor; getSensorByDeviceId; updateLastSeen (existiert, wird nie aufgerufen) | ⚠️ halbfertig |
| `convex/users.ts` | createUser; getUserByClerkId; isDevUser | ✅ fertig |

### Backend (Node.js / Hono)

| Pfad | Aufgabe | Status |
|------|---------|--------|
| `backend/src/index.ts` | Hono App; GET /api/status/:id/:date; Mount /dev Router; CronJob Start | ✅ fertig |
| `backend/src/config.ts` | ENV-Loader; CRON_INTERVAL_MINUTES, MIN_READINGS_REQUIRED, CRON_SCHEDULE_ENABLED, CONVEX_URL | ✅ fertig |
| `backend/src/jobs/cronJob.ts` | node-cron Scheduler; runCronJobOnce(); iteriert alle Sensoren mit heutigen Readings | ✅ fertig |
| `backend/src/lib/processor.ts` | processSessionIfReady(); Median → State → createDailySummary → deleteReadings | ✅ fertig |
| `backend/src/lib/analysis.ts` | calculateMedian(); getMoistureState(); getTemperatureState(); getLightState() | ✅ fertig |
| `backend/src/lib/convex.ts` | ConvexHttpClient Singleton | ✅ fertig |
| `backend/src/routes/devmode.ts` | GET /dev/info; POST /dev/simulate (8 Szenarien); POST /dev/trigger-cron | ✅ fertig |

### Mobile App (Expo / React Native)

| Pfad | Aufgabe | Status |
|------|---------|--------|
| `mobile/app/_layout.tsx` | Root Layout; ClerkProvider + ConvexProvider Wrapping | ✅ fertig |
| `mobile/app/index.tsx` | Auth Guard: isSignedIn → (home), else → (auth)/sign-in | ✅ fertig |
| `mobile/app/(auth)/_layout.tsx` | Auth Route Group: redirect zu (home) wenn bereits eingeloggt | ✅ fertig |
| `mobile/app/(auth)/sign-in.tsx` | Login Form; Password + MFA (email_code/phone_code) | ✅ fertig |
| `mobile/app/(auth)/sign-up.tsx` | Registrierung; Email-Verifizierung; legalAccepted Checkbox | ✅ fertig |
| `mobile/app/(home)/_layout.tsx` | Home Stack; gestureEnabled=false für status Screen | ✅ fertig |
| `mobile/app/(home)/index.tsx` | Post-Login-Redirect; auto createUser; plants[0] → status oder onboarding | ✅ fertig |
| `mobile/app/(home)/onboarding.tsx` | Sensor + Plant Registrierung; default device_id = "fake-sensor-001" | ⚠️ halbfertig |
| `mobile/app/(home)/status.tsx` | Pflanzenstatus; 3× MetricCard (Feuchtigkeit/Temperatur/Licht); Logout | ✅ fertig |
| `mobile/app/(home)/devmode.tsx` | Dev Tools Screen; Server-Probe; 8 Szenario-Buttons; CronJob Trigger | ⚠️ halbfertig |
| `mobile/components/burger-menu.tsx` | Sliding Panel Menu; conditional Dev Tools Link (isDevUser) | ✅ fertig |
| `mobile/components/clerk-runtime-warning.tsx` | Warning-Komponente für Expo Go (Clerk braucht Dev Build) | ❌ nie verwendet |
| `mobile/components/themed-text.tsx` | Wrapper Komponente | ✅ fertig |
| `mobile/components/themed-view.tsx` | Wrapper Komponente | ✅ fertig |
| `mobile/components/ui/collapsible.tsx` | Collapsible UI Komponente | ✅ fertig |
| `mobile/components/ui/icon-symbol.tsx` | Icon Wrapper (Android/Web) | ✅ fertig |
| `mobile/components/ui/icon-symbol.ios.tsx` | Icon Wrapper (iOS SF Symbols) | ✅ fertig |
| `mobile/constants/colors.ts` | Farbpaletten light + dark; Fonts Konstanten | ✅ fertig |
| `mobile/constants/theme.ts` | Re-export von Colors, Fonts | ✅ fertig |

### Python Tooling

| Pfad | Aufgabe | Status |
|------|---------|--------|
| `fake_sensor.py` | 18 Readings per Lauf an CONVEX_HTTP_URL/readings; Random Walk State | ✅ fertig |

### Konfiguration

| Pfad | Aufgabe | Status |
|------|---------|--------|
| `.env` | Root: CONVEX_URL, CONVEX_HTTP_URL, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY | ✅ fertig |
| `.env.local` | Convex Dev Deployment Config (CONVEX_DEPLOYMENT, CONVEX_URL, CONVEX_SITE_URL) | ✅ fertig |
| `backend/.env` | CRON_INTERVAL_MINUTES=1, MIN_READINGS_REQUIRED=12, CONVEX_URL | ⚠️ Achtung: 1min Interval ist Dev-Einstellung |
| `mobile/.env` | EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, EXPO_PUBLIC_CONVEX_URL, EXPO_PUBLIC_DEV_SERVER_URL | ✅ fertig |

---

## 4. Was funktioniert end-to-end

Alle folgenden Flows wurden durch Codeanalyse verifiziert und sind funktionsfähig:

**Auth Flow**
- `sign-up.tsx:handleSubmit()` → Clerk `signUp.password()` → `signUp.verifications.sendEmailCode()` → `sign-up.tsx:handleVerify()` → `signUp.finalize()` → Redirect `/(home)`
- `sign-in.tsx:handleSubmit()` → Clerk `signIn.password()` → optional MFA (email_code / phone_code) → `signIn.finalize()` → Redirect `/(home)`
- `(auth)/_layout.tsx` schützt Auth-Routen gegen eingeloggte User (Redirect zu `/(home)`)

**User Provisioning**
- `(home)/index.tsx:useEffect` → `api.users.getUserByClerkId` (Convex query) → wenn `null`, `api.users.createUser` (einmalig via `hasCreatedUserRef`)

**Sensor-Registrierung**
- `onboarding.tsx:handleRegisterPlant()` → `api.sensors.registerSensor({device_id})` → `api.plants.createPlant({clerk_id, device_id, name})` → Redirect zu `status` mit URL-Params

**Daten-Ingestion (fake_sensor.py)**
- `fake_sensor.py:main()` → 18× `POST CONVEX_HTTP_URL/readings` → `convex/http.ts:isReadingBody()` Validierung → `api.http.createReading` mutation → `readings` Tabelle

**Daten-Ingestion (Dev Mode Simulate)**
- `devmode.tsx:sendScenario(scenario)` → `POST /dev/simulate {device_id, scenario}` → `devmode.ts:buildScenarioReadings()` → `api.http.createReading` ×N → `processSessionIfReady()` → `daily_summaries`

**CronJob Processing**
- `cronJob.ts:runCronJobOnce()` → `api.readings.getSensorsWithReadingsToday({date})` → für jeden sensor: `processor.ts:processSessionIfReady(sensor_id, date)`
- `processSessionIfReady()`: prüft ≥12 Readings → berechnet Median via `analysis.ts:calculateMedian()` → klassifiziert States → `api.readings.createDailySummary` → `api.readings.deleteReadingsBySensorAndDate`

**CronJob Manueller Trigger**
- `devmode.tsx:triggerCron()` → `POST /dev/trigger-cron` (mit `x-clerk-id` Header) → `devmode.ts` löscht bestehende Summaries → `runCronJobOnce()` → vollständige Verarbeitung

**Status Anzeige**
- `status.tsx` → `api.plants.getLatestSummary({device_id})` (Convex Realtime Query) → 3× `MetricCard` mit Emoji, Wert, State-Badge (success/warning/critical)

**Burger Menu mit Dev-Guard**
- `burger-menu.tsx` → `api.users.isDevUser({clerk_id})` → wenn `true`: "Dev Tools" Menüpunkt sichtbar → `navigateToDevTools()` → `/(home)/devmode`

**Server Discovery (Dev Mode)**
- `devmode.tsx:resolveServerUrl()` → probiert `EXPO_PUBLIC_DEV_SERVER_URL`, dann Android-Emulator-IP, dann hardcodierte Tailscale-IP → setzt `serverBaseUrl` State

---

## 5. Production Readiness

| Komponente | Production Ready | Was fehlt konkret |
|------------|-----------------|-------------------|
| Convex Schema | Nein | `firmware_version` wird nie befüllt; `last_seen` nie aktualisiert; `plants.sensor_id` ist Duplikat von `device_id` |
| Sensor HTTP Endpoint | Nein | Kein Authentication (kein API Key, kein Bearer Token); kein Rate Limiting; beliebiger Client kann Daten einspeisen |
| Dev Mode Auth | Nein | `x-clerk-id` Header ist self-reported; kein Clerk JWT-Verify; jeder mit gültiger clerk_id kann Dev-Endpoints aufrufen |
| CronJob Backend | Nein | `CRON_INTERVAL_MINUTES=1` in `backend/.env` (Dev-Einstellung); kein Deployment-Setup (kein Dockerfile, kein Prozess-Manager) |
| Processor | Ja | Robust; idempotent (already_processed Check); Median korrekt |
| Analysis (Thresholds) | Bedingt | Keine einheitliche Licht-"critical"-Stufe; Licht kann nur `dark` oder `bright` als non-ok sein, nie `critical`; Thresholds nicht konfigurierbar |
| Mobile Auth | Bedingt | MFA-Support vorhanden; Debug-Status sichtbar im Sign-In (`Clerk: ${status}`); kein Biometrie-Login |
| Mobile Status Screen | Bedingt | Nur `plants[0]` wird angezeigt; kein Multi-Plant-Support; kein Pull-to-Refresh |
| Mobile Onboarding | Nein | `device_id` Default = `fake-sensor-001` (hardcoded); kein QR-Code-Scan für echte Sensoren |
| Mobile Dev Mode | Nein | `BASE_URL` undefiniert in Error-Fallback-Pfaden; Tailscale-IP hardcodiert (`100.86.32.59`) |
| Notifications | Nein | Kein Push-Notification-System; User muss App aktiv öffnen |
| Datenhaltung | Nein | `daily_summaries` wachsen unbegrenzt; kein Cleanup; Raw Readings werden nach Verarbeitung gelöscht (kein Audit Trail) |
| Dark Mode Only | Nein | `Colors.light` Palette definiert aber nie genutzt; System-Theme wird ignoriert |
| Umgebungstrennung | Nein | Prod und Dev teilen eine Convex-Instanz |

---

## 6. Offene Vulnerabilities

| Name | Beschreibung | Priorität | Warum aktuell noch okay |
|------|-------------|-----------|------------------------|
| **Unauthenticated Sensor Endpoint** | `POST /readings` auf Convex HTTP akzeptiert jeden anonymen Request; `isReadingBody()` validiert nur Schema, nicht Herkunft | Hoch | Aktuell nur bekannte Sensoren, keine öffentliche App; URL nicht öffentlich verlinkt |
| **Unverified Clerk-ID Header** | `devmode.ts:parseAuthorizationHeader()` liest `x-clerk-id` Header als rohen String; Server verifiziert kein Clerk JWT; wer eine gültige `clerk_id` kennt, kann alle Dev-Endpoints aufrufen | Hoch | Dev Mode nur für `is_dev=true` User; Produktionsdaten nicht betroffen |
| **Fehlendes Rate Limiting** | Weder `/readings` noch `/dev/*` Endpoints haben Rate Limiting; potenzielle DoS oder Datenmüll-Angriffe | Mittel | Aktuell Einzelentwickler-Projekt; Convex hat eigene API-Limits als implizites Schutzlevel |
| **Test-Publishable-Key in Versionskontrolle** | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...` liegt in `mobile/.env`; bei GitHub-Push öffentlich einsehbar | Mittel | `pk_test_` Keys sind für Clerk-Entwicklung bestimmt und funktionieren nur in erlaubten Domains; kein Security-Risiko im üblichen Sinne |
| **Tailscale-IP hardcodiert im App-Code** | `devmode.tsx` enthält `'http://100.86.32.59:3000'` als hardcoded Fallback; interne Netzwerktopologie leakage | Niedrig | Nur im Dev-Build aktiv; kein Production-Impact |
| **Daten-Injizierbarkeit ohne Sensor-Registrierung** | Ein `sensor_id` muss nicht in der `sensors`-Tabelle registriert sein, um Readings einzuspeisen; Convex HTTP akzeptiert beliebige `sensor_id` Strings | Niedrig | Readings ohne registrierten Sensor landen in DB aber werden nie einem User angezeigt |

---

## 7. Bekannte Bugs und Schwächen

**Bug: `BASE_URL` undefiniert in `devmode.tsx` Error-Paths**
In `mobile/app/(home)/devmode.tsx` wird `BASE_URL` in drei Error-Catch-Blöcken (Zeilen ~233, ~315, ~389) referenziert, die greifen wenn `setRequestDebug`'s `current`-State null ist. `BASE_URL` ist in dieser Datei nie definiert – die korrekte Variable ist `serverBaseUrl` (State). Diese Paths würden einen `ReferenceError` werfen. Da sie nur unter Race-Conditions im ersten Millisekunde nach Mount getriggert werden, sind sie in der Praxis bisher nicht aufgefallen.

**Schwäche: `getLatestSummary` lädt alle Summaries in Memory**
`convex/plants.ts:getLatestSummary()` lädt per `.collect()` alle `daily_summaries` eines Sensors und sortiert dann in JavaScript. Mit wachsender Laufzeit (365 Einträge/Jahr) wird das zum Problem. Korrekt wäre eine `.order("desc")` auf dem Index.

**Schwäche: Doppelte ID-Felder in `plants`**
`createPlant` setzt sowohl `device_id` als auch `sensor_id` auf denselben Wert (`args.device_id`). `getPlantByDeviceId` hat einen Fallback, der zuerst `by_device_id`, dann `by_sensor_id` prüft. Diese Legacy-Struktur ist verwirrend und sollte konsolidiert werden.

**Schwäche: `updateLastSeen` wird nie aufgerufen**
`convex/sensors.ts:updateLastSeen` existiert, aber `convex/http.ts` ruft diese Mutation nach einem Reading-Insert nicht auf. Das `last_seen`-Feld in der `sensors`-Tabelle entspricht somit immer dem `created_at`-Zeitpunkt.

**Schwäche: `firmware_version` nie befüllt**
`convex/sensors.ts:registerSensor` setzt `firmware_version: undefined`. Es gibt keinen Mechanismus, dieses Feld zu aktualisieren – weder über HTTP-Endpoints noch über Dev Mode.

**Schwäche: `ClerkRuntimeWarning` ist totes Code**
`mobile/components/clerk-runtime-warning.tsx` wird nirgendwo importiert oder gerendert. Die Warnung erscheint damit nie.

**Schwäche: Dark Mode hardcoded**
Alle Screens importieren `Colors.dark` direkt. Das System-Theme des Geräts wird vollständig ignoriert, obwohl eine Light-Palette in `colors.ts` existiert.

**Schwäche: `readings.ts:getSensorsWithReadingsToday` doppelte Filter-Logik**
Der Convex-Index-Query filtert bereits per Range `[date, date￿]`, danach folgt ein zusätzliches `.filter(r => r.timestamp.startsWith(date))`. Das zweite Filter ist redundant, kostet aber Performance bei großen Datasets.

**Schwäche: Timestamp-Format ist nicht vollständiges ISO 8601**
`devmode.ts:formatTimestamp()` erzeugt `"2026-06-28T05"` (nur Stunden-Präfix, kein Minuten/Sekunden-Anteil). `fake_sensor.py` nutzt `datetime.now().isoformat(timespec="hours")` mit ähnlichem Output (`2026-06-28T05:00:00`). Beide Formate funktionieren mit den Index-Queries, sind aber nicht Standard-ISO-8601 im engeren Sinne.

**Schwäche: Ein-Pflanze-Limitation**
`(home)/index.tsx`, `status.tsx` und `devmode.tsx` greifen alle auf `plants[0]` zu. Nutzer mit mehreren registrierten Pflanzen sehen nur die erste.

**Schwäche: Debug-Status im Sign-In sichtbar**
`sign-in.tsx` Zeile ~208: `` `Clerk: ${signIn.status ?? 'unknown'}` `` ist als `styles.debug` Text permanent sichtbar – auch in Production-Builds.

---

## 8. Nächste Schritte

### Sofort (nächste Session)

1. **`BASE_URL` Bug in `devmode.tsx` fixen** – alle drei Error-Fallback-Blöcke: `BASE_URL` → `serverBaseUrl ?? SERVER_CANDIDATES[0]`
2. **Debug-Status aus `sign-in.tsx` entfernen** – `<Text style={styles.debug}>` Block löschen
3. **`backend/.env` `CRON_INTERVAL_MINUTES`** für Production auf `60` setzen; Dev-Setting dokumentieren
4. **`getLatestSummary` Query optimieren** – `.order("desc").first()` statt `.collect() + sort`

### Diese Woche

5. **Sensor-Endpoint Authentication** – API Key per Sensor als HTTP Header (`Authorization: Bearer <key>`) oder HMAC-Signatur; Key in Convex `sensors`-Tabelle ablegen
6. **`x-clerk-id` Header ersetzen** – Backend soll stattdessen Clerk JWT via `Authorization: Bearer <token>` verifizieren; Clerk bietet JWT-Verification ohne SDK
7. **`updateLastSeen` aufrufen** – in `convex/http.ts` nach `createReading` aufrufen
8. **`plants.sensor_id` Duplikat bereinigen** – Schema-Migration auf rein `device_id`; `getPlantByDeviceId` Fallback entfernen
9. **`ClerkRuntimeWarning` entfernen oder integrieren**
10. **`daily_summaries` TTL** – Mutation schreiben, die Summaries älter als N Tage löscht; als Dev-Trigger oder Convex Scheduled Action

### Nächste Woche

11. **Multi-Plant-Support** – Status Screen mit Plant-Selektor; Navigation zwischen Pflanzen
12. **Push Notifications** – Expo Push Notifications für Moisture-State `critical` und `low`
13. **Deployment-Setup** – Dockerfile für Backend; Railway/Fly.io Pipeline; Produktions-`.env` ohne Dev-Defaults
14. **Umgebungstrennung** – Zweites Convex Deployment für Production; `CONVEX_DEPLOYMENT=prod:...`
15. **Onboarding QR-Code-Scan** – `device_id` aus QR-Code eines echten Sensors lesen statt manueller Eingabe

---

## 9. Offene Architektur-Entscheidungen

**Sensor-Auth-Strategie**
Drei Optionen: (a) Pre-shared API Key per Sensor in HTTP-Header, (b) HMAC-Signatur mit Timestamp, (c) mTLS. Option (a) ist simpel zu implementieren, erfordert aber sichere Key-Speicherung im Sensor-Firmware. Entscheidung blockiert die gesamte Production-Security-Story.

**Backend-Deployment-Ziel**
Das Hono-Backend hat keinen Dockerfile, keinen Prozess-Manager und kein CI/CD. Railway, Fly.io und klassische VPS-Optionen sind alle unentschieden. Das beeinflusst, wie `EXPO_PUBLIC_DEV_SERVER_URL` konfiguriert wird und ob der Server über das öffentliche Internet erreichbar ist.

**Real-Sensor-Protokoll**
Aktuell HTTP POST. Für batteriebetriebene Sensoren ist HTTP Power-ineffizient. Alternativen: MQTT über einen Broker, CoAP, oder ein LoRaWAN-Gateway. Diese Entscheidung beeinflusst das Convex-Ingestion-Modell fundamental (direkter HTTP-Push vs. Backend-Relay).

**Multi-Plant-Datenmodell**
Das aktuelle Schema erlaubt mehrere Plants pro User (`by_clerk_id` Index), aber die App zeigt nur `plants[0]`. Soll ein User N Sensoren/Pflanzen haben? Wenn ja: UI-Konzept (Tab pro Pflanze vs. List Screen vs. Swipe-Carousel) und welche Plant als Default gilt, ist ungeklärt.

**Datenretention und historische Ansichten**
Raw Readings werden nach Verarbeitung gelöscht. `daily_summaries` wachsen unbegrenzt. Es gibt keinen Chart, keinen Verlauf, keine Trend-Anzeige. Ob historische Werte (Wochen/Monate) feature-relevant sind, ist nicht entschieden – bestimmt aber ob die Delete-nach-Aggregation-Strategie beibehalten werden kann.

**Plan-Monetarisierung**
`users.plan` ist hardcoded `"basic"`. Was `basic` vs. z.B. `pro` beinhaltet (mehr Pflanzen? längere History? Push Notifications?) ist komplett ungeklärt. Die Feld-Infrastruktur ist vorbereitet, aber es gibt keine Guards, keine Checks, keine Stripe-Integration.

**Licht-Schwellwert für `critical`**
`getLightState()` kennt nur `dark`, `ok`, `bright` – kein `critical`. Die Status-Screen `lightTone()`-Funktion mappt alle non-ok States auf `warning`. Für Pflanzen, die absolut kein Licht bekommen (Keller), ist das möglicherweise zu schwach. Entscheidung über einen vierten State oder Umbenennung steht aus.
