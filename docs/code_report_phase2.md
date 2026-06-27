# Planty – Code Report Phase 2

**Erstellt:** 2026-06-27  
**Basis:** Vollständige Codeanalyse aller Dateien in `convex/`, `backend/src/`, `mobile/`, `fake_sensor.py`, `.env`

---

## 1. Projektübersicht

**Planty** ist ein IoT-Pflanzensensor, der Nutzern mitteilt wenn ihre Pflanze Wasser, mehr Licht oder eine andere Temperatur benötigt. Das Alleinstellungsmerkmal: Die Pflanze kommuniziert mit einer eigenen KI-Persönlichkeit (fröhlich, lustig, ruppig) per Telegram-Nachricht, Sprachnachricht oder echtem Telefonanruf.

**Zielgruppe:** Botanik-Laien (primär Männer 20–35), die vergessen zu gießen.  
**Zielpreis:** 24,99 € UVP, Herstellungskosten 8–12 € in Serie.

**Wo wir stehen:** Phase 2 ist der erste vollständige Software-Stack – von simuliertem Sensor bis zur mobilen App. Die KI-Benachrichtigungen (Kernproduktfeature) sind noch nicht implementiert.

### Aktueller Tech Stack

| Schicht | Technologie | Version |
|---|---|---|
| Datenbank / BaaS | Convex | ^1.36.1 |
| Convex Deployment | `dusty-shrimp-80.eu-west-1.convex.cloud` | EU-West-1 |
| Backend Framework | Hono + Node.js | Hono ^4.0.0 |
| Backend Runtime | tsx (TypeScript executor) | ^4.0.0 |
| Cron-Scheduler | node-cron | ^4.0.0 |
| Mobile App | Expo (React Native) | ~54.0.0 |
| React | React 19 | 19.1.0 |
| React Native | - | 0.81.5 |
| Sensor-Simulator | Python + httpx | - |
| Firmware (Prototyp) | Arduino / ESP8266 C++ | - |

---

## 2. Systemarchitektur

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATENPFAD                                │
└─────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐                  ┌──────────────────────┐
  │  fake_sensor.py  │                  │  D1 Mini (ESP8285)   │
  │  (Python)        │                  │  [Firmware / TODO]   │
  │                  │                  │                      │
  │  18 Messungen    │                  │  analogRead(A0) →    │
  │  moisture 0–100  │                  │  moisture %          │
  │  temp 10–35°C    │                  │  temp (TODO)         │
  │  light 0–2000lux │                  │  light (TODO)        │
  └────────┬─────────┘                  └──────────┬───────────┘
           │                                        │
           │  POST /readings                        │  POST HTTP
           │  JSON: {sensor_id, moisture,           │  (zu CONVEX_HTTP_URL)
           │         temperature, light_level,      │
           │         timestamp}                     │
           └──────────────────┬─────────────────────┘
                              ▼
              ┌───────────────────────────────┐
              │  CONVEX HTTP ENDPOINT         │
              │  convex/http.ts               │
              │                               │
              │  POST /readings               │
              │  → isReadingBody() Validierung│
              │  → moisture range 0–100 check │
              │  → ctx.runMutation(           │
              │      api.http.createReading)  │
              │  ← 201 { ok: true, id }       │
              └───────────────┬───────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │  CONVEX DATENBANK             │
              │  (Realtime, EU-West-1)        │
              │                               │
              │  Tabelle: readings            │
              │  ┌──────────────────────────┐ │
              │  │ sensor_id  │ string      │ │
              │  │ moisture   │ number      │ │
              │  │ temperature│ float64     │ │
              │  │ light_level│ number      │ │
              │  │ timestamp  │ string      │ │
              │  └──────────────────────────┘ │
              └───────────────┬───────────────┘
                              │
                              │ (parallel, realtime subscription)
              ┌───────────────┴────────────────────────┐
              │                                        │
              ▼                                        ▼
┌─────────────────────────────┐        ┌──────────────────────────┐
│  HONO BACKEND               │        │  EXPO MOBILE APP         │
│  backend/src/               │        │  mobile/                 │
│                             │        │                          │
│  startCronJob()             │        │  ConvexProvider          │
│  → alle 60 Min              │        │  → ConvexReactClient     │
│  → getReadings() [ALL!]     │        │                          │
│  → pro sensor_id:           │        │  useQuery(               │
│    getSummaryByDate()       │        │    plants.getPlantBy     │
│    if none:                 │        │    SensorId)             │
│      processSessionIfReady()│        │                          │
│      if readings >= 12:     │        │  if null:                │
│        calculateMedian()    │        │    <OnboardingScreen>    │
│        getMoistureState()   │        │    → createPlant()       │
│        getTemperatureState()│        │                          │
│        getLightState()      │        │  if plant exists:        │
│        createDailySummary() │        │    <StatusScreen>        │
│        deleteReadings()     │        │    useQuery(             │
│                             │        │      plants.getLatest    │
│  GET /api/status/           │        │      Summary)            │
│    :sensor_id/:date         │        │    → MetricCard x3       │
│  → getSummaryByDate()       │        │      (moisture/temp/     │
│                             │        │       light)             │
└─────────────────────────────┘        └──────────────────────────┘
              │                                        ▲
              │         CONVEX DATENBANK               │
              │  Tabelle: daily_summaries              │
              │  ┌──────────────────────────────────┐  │
              └► │ sensor_id         │ string       │ ─┘
                 │ date              │ string       │
                 │ moisture_median   │ number       │
                 │ temperature_median│ number       │
                 │ light_level_median│ number       │
                 │ moisture_state    │ critical/    │
                 │                  │ low/ok       │
                 │ temperature_state │ cold/ok/hot  │
                 │ light_state       │ dark/ok/     │
                 │                  │ bright       │
                 │ created_at        │ number       │
                 └──────────────────────────────────┘

  Tabelle: plants
  ┌──────────────────────────────┐
  │ sensor_id  │ string         │
  │ name       │ string         │
  │ created_at │ number         │
  └──────────────────────────────┘
```

---

## 3. Datei-Inventar

| Pfad | Aufgabe | Status |
|---|---|---|
| `fake_sensor.py` | Simuliert 18 Sensor-Messungen, sendet per HTTP an Convex | ✅ funktioniert |
| `.env` | `CONVEX_URL` + `CONVEX_HTTP_URL` für Backend und fake_sensor | ✅ funktioniert |
| `mobile/.env` | `EXPO_PUBLIC_CONVEX_URL` für Expo App | ✅ funktioniert |
| `convex/schema.ts` | Datenbankschema: `readings`, `plants`, `daily_summaries` | ✅ funktioniert |
| `convex/http.ts` | HTTP-Router für Convex, `POST /readings`, `GET /readings`, `createReading` Mutation | ✅ funktioniert |
| `convex/readings.ts` | Queries/Mutations: `getReadingsBySensorAndDate`, `getSummaryBySensorAndDate`, `createDailySummary`, `deleteReadingsBySensorAndDate` | ✅ funktioniert |
| `convex/plants.ts` | Queries/Mutations: `getPlantBySensorId`, `createPlant`, `getLatestSummary` | ✅ funktioniert |
| `convex/myFunctions.ts` | Scaffold-Datei (leer) | ❌ leer/unbenutzt |
| `backend/src/index.ts` | Hono-Server Entry Point, `GET /api/status/:sensor_id/:date`, startet CronJob | ✅ funktioniert |
| `backend/src/config.ts` | Env-Loading, Exports: `CONVEX_URL`, `CRON_INTERVAL_MINUTES`, `MIN_READINGS_REQUIRED` | ✅ funktioniert |
| `backend/src/jobs/cronJob.ts` | node-cron-Job (default 60 Min), orchestriert Verarbeitung | ✅ funktioniert |
| `backend/src/lib/convex.ts` | Singleton `ConvexHttpClient` | ✅ funktioniert |
| `backend/src/lib/analysis.ts` | Pure functions: `calculateMedian`, `getMoistureState`, `getTemperatureState`, `getLightState` | ✅ funktioniert |
| `backend/src/lib/processor.ts` | `processSessionIfReady()` – Kernlogik: Median, State, Summary erstellen, Raw-Readings löschen | ✅ funktioniert |
| `backend/src/routes/readings.ts` | Readings-Router – aktuell nur Stub, gibt `{ message: 'Readings endpoint' }` zurück | ⚠️ Stub |
| `mobile/App.tsx` | Routing: Loading → OnboardingScreen oder StatusScreen | ✅ funktioniert |
| `mobile/screens/OnboardingScreen.tsx` | Pflanze anlegen (Name + Sensor ID Eingabe, `createPlant` Mutation) | ✅ funktioniert |
| `mobile/screens/StatusScreen.tsx` | Tagesübersicht: 3 MetricCards (Moisture, Temp, Light), Zeitstempel | ✅ funktioniert |
| `mobile/constants/colors.ts` | Dark-Mode Farbpalette (background, card, border, states) | ✅ funktioniert |
| `mobile/index.ts` | Expo App Entry | ✅ funktioniert |
| `firmware/` | Firmware-Verzeichnis (leer) | ❌ fehlt noch |
| `frontend/` | Web-App Verzeichnis (leer) | ❌ fehlt noch |

---

## 4. Was funktioniert bereits

### 4.1 Convex HTTP Ingestion (`convex/http.ts`)

Der HTTP-Endpoint nimmt Sensordaten entgegen, validiert sie und schreibt sie in die Datenbank.

```typescript
// convex/http.ts:36–61 – Type Guard mit vollständiger Feldprüfung
function isReadingBody(value: unknown): value is { ... } {
    return (
        typeof body.sensor_id === "string" &&
        typeof body.moisture === "number" &&
        Number.isFinite(body.moisture) &&  // NaN/Infinity werden abgefangen
        ...
    )
}

// convex/http.ts:64–100 – Route mit Range-Validierung
http.route({
    path: "/readings", method: "POST",
    handler: httpAction(async (ctx, request) => {
        if (!isReadingBody(body) || body.moisture < 0 || body.moisture > 100) {
            return new Response(JSON.stringify({ error: "..." }), { status: 400 })
        }
        const result = await ctx.runMutation(api.http.createReading, body)
        return new Response(JSON.stringify(result), { status: 201 })
    })
})
```

### 4.2 Fake Sensor (`fake_sensor.py`)

Simulates 18 aufeinanderfolgende Messungen mit realistischem Drift (kein Sprung).

```python
# fake_sensor.py:26–28 – State-based Random Walk
state["moisture"] = clamp(state["moisture"] + random.randint(-2, 2), 0, 100)
state["temperature"] = clamp(state["temperature"] + random.uniform(-0.3, 0.3), 10, 35)
state["light_level"] = clamp(state["light_level"] + random.randint(-50, 50), 0, 2000)
```

### 4.3 Analyse-Pipeline (`backend/src/lib/`)

Vollständig implementierte, pure Funktionen ohne Seiteneffekte:

```typescript
// analysis.ts – Median-Berechnung korrekt für gerade und ungerade Arrays
export const calculateMedian = (values: number[]): number => {
    const sortedValues = [...values].sort((left, right) => left - right)
    const middleIndex = Math.floor(sortedValues.length / 2)
    if (sortedValues.length % 2 === 1) return sortedValues[middleIndex]
    return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2
}

// analysis.ts – Schwellenwerte für alle 3 Dimensionen
getMoistureState(median)    // < 20 → critical, ≤ 40 → low, > 40 → ok
getTemperatureState(median) // < 15 → cold, ≤ 28 → ok, > 28 → hot
getLightState(median)       // < 200 → dark, ≤ 800 → ok, > 800 → bright
```

### 4.4 Processor / Tagesverarbeitung (`backend/src/lib/processor.ts`)

Idempotente Verarbeitung: prüft erst, ob genug Daten vorhanden und ob ein Summary bereits existiert.

```typescript
// processor.ts:46–85 – vollständige Guard-Logik
if (readings.length < MIN_READINGS_REQUIRED) return { status: 'insufficient_data' }
if (existingSummary) return { status: 'already_processed' }
// ... berechne Mediane, klassifiziere, schreibe Summary, lösche Raw-Readings
```

### 4.5 CronJob (`backend/src/jobs/cronJob.ts`)

Konfigurierbar über Env-Variable `CRON_INTERVAL_MINUTES` (Default: 60 Min).

```typescript
// cronJob.ts:50–58 – dynamischer Cron-Ausdruck
export const startCronJob = (): cron.ScheduledTask => {
    const expression = `*/${CRON_INTERVAL_MINUTES} * * * *`
    return cron.schedule(expression, async () => { await runCronJobOnce() })
}
```

### 4.6 Mobile App – Routing + State (`mobile/App.tsx`)

Drei-Zustände-Automat: Loading → Onboarding → Status. Convex real-time subscriptions ohne manuelles Polling.

```typescript
// App.tsx:21–41 – reaktiver Routing-Baum
const plant = useQuery(api.plants.getPlantBySensorId, { sensor_id: sensorId })
const latestSummary = useQuery(api.plants.getLatestSummary, { sensor_id: sensorId })

if (plant === undefined) return <LoadingSpinner />  // Convex verbindet noch
if (plant === null) return <OnboardingScreen />      // Noch keine Pflanze
return <StatusScreen plant={plant} latestSummary={latestSummary} />
```

### 4.7 StatusScreen – Responsives Layout (`mobile/screens/StatusScreen.tsx`)

Adaptive Grid-Darstellung: unter 720px gestapelt, ab 720px nebeneinander.

```typescript
// StatusScreen.tsx:50–52
const { width } = useWindowDimensions()
const isWide = width >= 720
// metricsGridWide: flexDirection: "row" | metricsGridStack: "column"
```

---

## 5. Production-Readiness

| Komponente | Production Ready? | Was fehlt noch |
|---|---|---|
| Convex Schema | Nein | Database-Indizes fehlen (Queries scannen ganzen Table) |
| Convex HTTP Endpoint | Nein | Keine Authentifizierung, kein Rate-Limiting, kein CORS-Header |
| `fake_sensor.py` | Nein | Nur 18 einmalige Messungen, keine kontinuierliche Simulation |
| Analyse-Funktionen (`analysis.ts`) | Ja | Keine Änderungen nötig |
| `processor.ts` | Fast | Per-Pflanze-Schwellenwerte fehlen (derzeit global hardcoded) |
| CronJob | Nein | Lädt ALLE Readings ungepaginiert, skaliert nicht |
| Hono-Backend | Nein | `routes/readings.ts` ist ein Stub, kein Health-Check, kein Logging |
| Mobile App – Onboarding | Nein | Sensor-ID ist hardcoded (`"fake-sensor-001"`), kein echtes Pairing |
| Mobile App – StatusScreen | Fast | Keine Pull-to-Refresh, keine Offline-Anzeige |
| Auth / Multi-Tenancy | Nein | `plants` Tabelle hat kein `user_id`, jeder kann auf alle Daten zugreifen |
| Benachrichtigungen | Nein | Kernfeature (Telegram/Anruf/KI-Stimme) noch nicht gebaut |
| Firmware | Nein | Verzeichnis leer; Prototyp-Code ist auf Homeserver, nicht im Repo |
| Web-Frontend | Nein | Verzeichnis leer |
| CI/CD | Nein | Kein Test-Runner, keine Pipeline |

---

## 6. Offene Vulnerabilities

### V1 – Kein API-Authentifizierung am Convex HTTP Endpoint
**Beschreibung:** `POST https://dusty-shrimp-80.eu-west-1.convex.site/readings` ist öffentlich erreichbar. Jeder kennt die URL kann beliebige Daten unter beliebigen `sensor_id`s einschleusen, Tabellen fluten oder fremde Pflanzendaten manipulieren.  
**Priorität:** Hoch  
**Warum aktuell okay:** Deployment ist nicht öffentlich beworben, `sensor_id` ist bisher nur `"fake-sensor-001"`, kein realer Schaden möglich da kein echter User.

---

### V2 – Convex URL in `.env` ohne sichere Handhabung
**Beschreibung:** Die Root-`.env` enthält `CONVEX_URL` und `CONVEX_HTTP_URL`. Die Datei ist per `.gitignore` ausgeschlossen, aber die mobile `.env` (`EXPO_PUBLIC_CONVEX_URL`) ist **committed** und damit im Repository.  
**Priorität:** Mittel  
**Warum aktuell okay:** `EXPO_PUBLIC_*` Variablen sind bei Expo per Design öffentlich (werden ins Bundle gebuilt). Kein Secret, aber die Convex-URL erlaubt direkten DB-Zugriff – Problem aus V1.

---

### V3 – Kein Rate-Limiting
**Beschreibung:** Der Convex HTTP Endpoint und der Hono-Backend-Endpoint haben kein Rate-Limiting. Ein Angreifer könnte die Readings-Tabelle mit Millionen Einträgen fluten, was Convex-Kosten erzeugt und die Verarbeitung blockiert.  
**Priorität:** Mittel  
**Warum aktuell okay:** Kein öffentlicher Traffic, Convex hat eigene tägliche Transaktionslimits im Free Tier.

---

### V4 – CronJob lädt alle Readings ungepaginiert
**Beschreibung:** `cronJob.ts:15` ruft `api.http.getReadings` auf – das lädt **alle** Readings aller Sensoren aller Tage in den Node.js-Speicher. Convex hat ein Maximum von 8192 Dokumenten pro Query-Response.  
**Priorität:** Mittel  
**Warum aktuell okay:** Bei 18 Fake-Messungen kein Problem. Explodiert aber mit echten Usern.

---

### V5 – Sensor-ID als einzige Identität (kein User-Scoping)
**Beschreibung:** Die `plants`-Tabelle hat kein `user_id`. Wer die `sensor_id` kennt (`"fake-sensor-001"`) kann die Pflanzendaten lesen und manipulieren. Später mit echten Usern ist das ein vollständiges Datenleck.  
**Priorität:** Hoch  
**Warum aktuell okay:** Nur ein Entwickler, keine echten User-Daten.

---

### V6 – Timestamp-Granularität auf Stunden-Ebene
**Beschreibung:** `fake_sensor.py:29` generiert Timestamps mit `timespec="hours"` (z.B. `"2026-06-27T14"`). Das bedeutet alle Messungen innerhalb einer Stunde haben denselben Timestamp. Die Filterlogik in `readings.ts` und `cronJob.ts` nutzt `startsWith(date)` (10-Zeichen ISO-Date), was korrekt funktioniert. Aber für echtes Debugging und Audit-Trail ist Stunden-Granularität unzureichend.  
**Priorität:** Niedrig  
**Warum aktuell okay:** Funktionslogik ist korrekt, nur Informationsverlust.

---

## 7. Nächste Implementierungsschritte

### Priorität 1 – Datenbankindizes (Convex Schema)
**Was:** `readings` und `daily_summaries` Indizes für `sensor_id` und `date` hinzufügen.  
**Warum zuerst:** Alle anderen Features bauen auf diesen Queries auf. Ohne Indizes werden alle nachfolgenden Features mit echten Daten sofort langsam. In Convex kostet ein fehlender Index O(n) statt O(log n) – muss vor echtem Traffic behoben sein.

```typescript
// convex/schema.ts – so sollte es aussehen:
readings: defineTable({ ... }).index("by_sensor_id", ["sensor_id"])
daily_summaries: defineTable({ ... }).index("by_sensor_and_date", ["sensor_id", "date"])
```

---

### Priorität 2 – CronJob Query reparieren
**Was:** `cronJob.ts` soll nicht mehr `getReadings` (alle) aufrufen, sondern nur Readings des aktuellen Tages per Index abfragen.  
**Warum:** V4 ist ein Show-Stopper für Skalierung. Direkt nach Priorität 1 da vom Index abhängig.

---

### Priorität 3 – Benachrichtigungs-Pipeline (Telegram)
**Was:** Wenn `processSessionIfReady()` ein `daily_summary` mit `moisture_state: "critical"` erzeugt, Telegram-Nachricht an konfigurierten Chat senden.  
**Warum:** Das ist das Kernproduktfeature. Bisher ist Planty nur eine Datenbank-App, keine IoT-Lösung die Nutzer kontaktiert. Telegram first weil am schnellsten zu implementieren und bereits in Phase 1 erprobt.

---

### Priorität 4 – Auth & Multi-Tenancy (Clerk)
**Was:** Clerk-Integration, `user_id` zu `plants` hinzufügen, alle Convex-Queries mit `ctx.auth` absichern.  
**Warum:** Ohne Auth kein echtes Beta-Deployment. Muss vor dem ersten echten User erledigt sein. Beeinflusst das Schema grundlegend.

---

### Priorität 5 – Echter Sensor im Repo (`firmware/`)
**Was:** Den Firmware-Code aus der Projektdoku (`planty_projektbeschreibung.md`) in `firmware/main.ino` migrieren, mit `CONVEX_HTTP_URL` statt Homeserver-IP, und `sensor_id` als `ESP.getChipId()` statt hardcoded.  
**Warum:** Solange Firmware nicht im Repo ist, ist Planty kein IoT-Projekt sondern eine Expo-App mit Python-Script. Außerdem Deep Sleep statt `delay()` für Akkubetrieb.

---

### Priorität 6 – Mobile Push-Notifications
**Was:** Expo Notifications integrieren, damit die App Push-Nachrichten empfangen kann.  
**Warum:** Nutzer haben die App nicht ständig offen. Telegram ist Workaround, Push-Notifications sind das native mobile Feature.

---

### Priorität 7 – `backend/src/routes/readings.ts` abschließen oder entfernen
**Was:** Der Router ist ein Stub ohne Funktion. Entweder implementieren (z.B. als interner Endpoint für manuelle Sensor-Injektions-Tests) oder löschen.  
**Warum:** Toter Code verwirrt, welche API tatsächlich aktiv ist.

---

### Priorität 8 – Timestamp auf Minuten-Granularität
**Was:** In `fake_sensor.py` `timespec="hours"` auf `timespec="minutes"` ändern. Analog im echten Sensor.  
**Warum:** Debugging und spätere Analytik (Tagesverlauf visualisieren) ist mit Stunden-Timestamps nicht möglich.

---

## 8. Offene technische Fragen

### 8.1 Convex als primärer Datenpfad vs. Hono-Backend
Aktuell schreiben Sensoren direkt an den Convex HTTP Endpoint. Das Hono-Backend liest nur für den CronJob und den Status-Endpoint. Frage: Soll der Sensor-Datenpfad dauerhaft direkt zu Convex gehen, oder soll das Hono-Backend als Gateway vor Convex stehen (für Rate-Limiting, Auth-Middleware, Transformation)?

**Implikation:** Direkter Weg ist einfacher und latenzärmer; Gateway erlaubt zentrales Rate-Limiting und Authentifizierung unabhängig von Convex-Billing.

---

### 8.2 Benachrichtigungslogik: Wann genau soll kontaktiert werden?
Die aktuelle Architektur aggregiert einmal täglich. Das bedeutet die Benachrichtigung kommt frühestens nach `MIN_READINGS_REQUIRED = 12` Messungen (bei einem echten Sensor alle 10 Minuten = nach 2 Stunden). Ist das akzeptabel, oder soll bei jeder eingehenden Messung ein Echtzeit-Check ausgeführt werden?

**Implikation:** Echtzeit-Check erfordert einen Convex-Action/Mutation-Trigger oder einen Webhook. Tages-Batch ist einfacher, reagiert aber langsamer auf kritische Zustände.

---

### 8.3 Per-Pflanze-Schwellenwerte vs. globale Schwellenwerte
`analysis.ts` hat globale, hardcodierte Schwellenwerte für alle Pflanzen. Eine Monstera braucht andere Feuchtigkeitswerte als ein Kaktus. Soll die Schwellwerttabelle in der Datenbank liegen (pro Pflanzenart konfigurierbar) oder reichen globale Defaults mit optionaler User-Anpassung?

---

### 8.4 Welcher Kommunikationskanal wird zuerst vollständig gebaut?
Laut Roadmap sind drei Kanäle geplant: Telegram Text, Telegram Sprachnachricht (ElevenLabs), Telefonanruf (Asterisk + easybell). Für Beta genügt einer. Telegram Text ist am schnellsten (Library bereits aus Phase 1 bekannt). ElevenLabs ist der USP. Priorität unklar.

---

### 8.5 Wo läuft das Hono-Backend in Produktion?
Aktuell läuft es lokal per `tsx watch`. Für Produktion benötigt es einen Server (VPS, Homeserver, Cloud). Convex-Funktionen (queries/mutations/actions) sind serverless und laufen auf Convex-Infrastruktur. Das Hono-Backend ist nur für den CronJob und den `/api/status` Endpoint nötig – beides ließe sich alternativ als Convex Scheduled Action und Convex HTTP Action migrieren, was das Hono-Backend überflüssig machen würde.

---

### 8.6 Wie wird das WLAN-Onboarding des echten Sensors gelöst?
Zwei Optionen aus der Projektdoku: Access-Point-Modus (ESP8285) oder Bluetooth-Pairing (ESP32). Die Entscheidung beeinflusst den Mikrocontroller-Wechsel und damit Firmware, Kosten und den gesamten Onboarding-Flow in der App.
