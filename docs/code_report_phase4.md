# Planty – Code Report Phase 4

_Stand: 2026-07-02 | Erstellt auf Basis vollständiger Analyse von `convex/`, `backend/src/`, `mobile/app/`, `mobile/components/`, `mobile/constants/` und `fake_sensor.py`_

---

## 1. Projektübersicht

Planty ist eine IoT-Pflanzenmessungsapp mit KI-Persönlichkeit: Sensoren senden Feuchtigkeits-, Temperatur- und Lichtwerte, ein Backend aggregiert sie zu Tageszusammenfassungen und klassifiziert den Pflanzenzustand, und ein externer n8n-Workflow generiert darauf aufbauend personalisierte Nachrichten via Claude API, die über Push, In-App-Inbox oder Telegram zugestellt werden. Die App besteht aus vier Schichten: Convex als serverloses Backend-as-a-Service (Datenhaltung + Realtime-Queries), einem Node.js/Hono-Prozessor-Backend (Aggregation, Cron, Auth-Gateway), einem externen n8n-Workflow mit Claude-Integration (Nachrichtengenerierung, Eskalationston, Zustellung) und einer React-Native/Expo-App mit Clerk-Authentifizierung. Seit Phase 3 sind Multi-Plant-Management, eine kuratierte 95-Pflanzen-Datenbank, historische Chart-Ansichten, Sensor-Status-Tracking, Telegram-Integration, Push Notifications und individuelle KI-Charaktere pro Pflanze hinzugekommen. Die Sensor-HTTP-Authentifizierung wurde für Dev-Mode-Routen von einem unverifizierten `x-clerk-id`-Header auf echte Clerk-JWT-Verifizierung (`@clerk/backend`) umgestellt, während der öffentliche Convex-Ingestion-Endpunkt (`POST /readings`) weiterhin unauthentifiziert bleibt. Die gesamte Infrastruktur läuft weiterhin gegen eine einzelne Convex-Deployment-Instanz ohne Prod/Dev-Trennung; echte ESP32-Firmware existiert noch nicht (`firmware/d1_mini/` ist leer).

---

## 2. Systemarchitektur

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  DATENQUELLEN                                                                │
│                                                                              │
│  fake_sensor.py ──────────────────────────────────────────┐                 │
│  (Python, 18 Readings, POST direkt an Convex HTTP)         │                 │
│                                                              │                 │
│  Dev Mode Simulate/Time-Travel ─────────────────────────┐  │                 │
│  (mobile/app/(home)/devmode.tsx, time-travel-tab.tsx)    │  │                 │
│  8 Szenarien + rückdatierte Batch-Einträge                │  │                 │
│                                                              ▼  ▼                 │
│  Echte ESP32-Firmware: NICHT VORHANDEN (firmware/d1_mini/ leer)              │
└──────────────────────────────────────────────────────────────────────────────┘
                                                              │
                                                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  CONVEX (BaaS)                                                              │
│                                                                              │
│  HTTP Endpoint:  POST /readings  (convex/http.ts)                          │
│  ← isReadingBody() Validierung, KEIN Auth, KEIN Rate Limit                  │
│  → createReading mutation → readings-Tabelle                               │
│  → sensors.updateLastSeen (unauthentifiziert, backend-only per Konvention) │
│                                                                              │
│  Tabellen (convex/schema.ts):                                              │
│  users · sensors · readings · plants · plant_species                        │
│  · daily_summaries · messages                                              │
│                                                                              │
│  plants: device_id/sensor_id (Duplikat), character, thresholds,            │
│          consecutive_critical_days, last_critical_date                     │
│  messages: clerk_id, device_id, plant_name, type, state, text, read        │
└──────────────────────────────────────────────────────────────────────────────┘
        ▲                    ▲                              ▲
        │ ConvexHttpClient    │ ConvexHttpClient              │ ConvexReactClient
        │ (backend, unauth)   │ (backend, mit Clerk-Token)    │ (mobile, Realtime, Clerk-Auth)
┌───────┴────────────────────┴──────────────┐   ┌─────────────┴───────────────────┐
│  NODE.JS BACKEND (Hono, Port 3000)         │   │  MOBILE APP (Expo / RN)          │
│                                             │   │                                  │
│  src/index.ts                              │   │  app/_layout.tsx                 │
│  ├─ GET /                                  │   │  ├─ ClerkProvider + ConvexProvider│
│  ├─ GET /api/status/:sensor_id/:date       │   │  └─ PushTokenRegistration         │
│  ├─ /dev/*        (Clerk-JWT + isDevUser)  │   │     (expo-notifications Token     │
│  ├─ /notifications/* (statisches Secret)   │   │      → users.updatePushToken)     │
│  ├─ /sensor/*     (KEIN Auth)              │   │                                  │
│  └─ /telegram/*   (Telegram Webhook)       │   │  (auth)/sign-in, sign-up          │
│                                             │   │  → Clerk password + MFA          │
│  lib/auth.ts                               │   │                                  │
│  └─ clerkAuthMiddleware (verifyToken)      │   │  (home)/index.tsx                 │
│                                             │   │  → createUser (auto) → Redirect   │
│  jobs/cronJob.ts                           │   │    plant-list oder onboarding     │
│  └─ node-cron (Intervall via .env)         │   │                                  │
│     runCronJobOnce()                       │   │  (home)/plant-list.tsx            │
│                                             │   │  ├─ Pflanzenkarten + Status-Badge │
│  lib/processor.ts                          │   │  └─ Inbox-Badge (unreadCount)     │
│  ├─ processSessionIfReady()                │   │                                  │
│  │  Median → State → createDailySummary    │   │  (home)/inbox.tsx                 │
│  ├─ createInboxMessage() → Platzhaltertext │   │  └─ Nachrichtenliste, markAsRead   │
│  │  "🌱 Nachricht wird generiert..."       │   │                                  │
│  ├─ Kontaktzeitfenster-Filter              │   │  (home)/add-plant.tsx             │
│  ├─ Eskalationszähler                      │   │  ├─ mit/ohne Sensor               │
│  │  (incrementCriticalDays/reset)          │   │  └─ Sensor-Transfer + Warndialog  │
│  └─ notifyN8nIfNeeded()                    │   │                                  │
│     → POST N8N_WEBHOOK_URL                 │   │  (home)/status.tsx                │
│                                             │   │  ├─ MetricCards + Sensor-Status   │
│  lib/sensorProblem.ts                      │   │  └─ Chart (victory-native+Skia)   │
│  └─ handleSensorProblem()                  │   │     7/14 Tage + Custom-Range      │
│     status='needs_remeasurement'           │   │                                  │
│     → POST N8N_SYSTEM_WEBHOOK_URL          │   │  (home)/plant-settings.tsx        │
│                                             │   │  ├─ Charakter (happy/grumpy/     │
│  lib/analysis.ts                           │   │  │  neutral)                     │
│  ├─ getMoistureState/getTemperatureState/  │   │  └─ Schwellenwerte pro Pflanze    │
│  │  getLightState                          │   │                                  │
│  └─ getEscalationMessage() – TOTER CODE,   │   │  (home)/global-settings.tsx       │
│     wird nirgends aufgerufen                │   │  ├─ notification_rules pro State │
└─────────────────────────────────────────────┘   │  ├─ Kontaktzeitfenster            │
        │                                          │  ├─ Telegram Connect/Disconnect   │
        │ HTTP Webhook (JSON)                      │  └─ Username, Messzeit           │
        ▼                                          │                                  │
┌─────────────────────────────────────────────┐   │  (home)/devmode.tsx               │
│  n8n WORKFLOW (extern, nicht im Repo)        │   │  ├─ Single/Multi Sensor Tabs      │
│  ── Claude API generiert Nachrichtentext      │   │  ├─ 8 Szenario-Buttons            │
│     basierend auf character, state,           │   │  ├─ Sensor-Problem-Trigger        │
│     consecutive_critical_days                │   │  └─ Zeitreise-Tab (time-travel-   │
│  ── ruft zurück:                             │   │     tab.tsx: Einzel + Batch)      │
│     POST /notifications/update-inbox         │   │                                  │
│     (Bearer INTERNAL_WEBHOOK_SECRET)          │   │  components/burger-menu.tsx       │
│     → messages.updateMessageText              │   │  └─ Menü, Dev-Tools-Link (isDev)  │
│  ── liefert zusätzlich aus über:             │   └──────────────────────────────────┘
│     Push (expo_push_token) / Telegram         │
│     (telegram_chat_id via Bot API) /          │
│     Anruf (nicht implementiert)               │
└───────────────────────────────────────────────┘

DATENFLUSS (Happy Path, Messung → Nachricht):
fake_sensor.py / Dev-Simulate
  → POST /readings (Convex HTTP, unauth)
  → readings-Tabelle
  → CronJob (node-cron, Intervall konfigurierbar) oder manueller Dev-Trigger
  → processSessionIfReady(): ≥ MIN_READINGS_REQUIRED? → Median je Dimension
  → createDailySummary (Convex) + setSensorStatus('active')
  → createInboxMessage(): Platzhalter-Message in Convex (sofort sichtbar in Inbox)
  → notifyN8nIfNeeded(): Webhook an n8n mit character, state, critical_days,
    notification_rules, telegram_chat_id, expo_push_token
  → [extern] n8n + Claude generieren finalen Text im Charakterton
  → POST /notifications/update-inbox (Secret-Auth) → updateMessageText
  → Mobile: Inbox/Status zeigen finalen Text via Convex Realtime Query
  → [extern] n8n liefert zusätzlich über Push/Telegram gemäß notification_rules
```

---

## 3. Datei-Inventar

### Convex (BaaS Layer)

| Pfad | Aufgabe | Status |
|------|---------|--------|
| `convex/schema.ts` | Tabellen: users, sensors, readings, plants, plant_species, daily_summaries, messages | ✅ fertig |
| `convex/http.ts` | HTTP-Endpunkt POST/GET `/readings`; Validierung, kein Auth | ⚠️ halbfertig |
| `convex/readings.ts` | CRUD readings/daily_summaries; Session-Queries; Kommentar "backend-only" aber technisch öffentlich (`mutation`/`query`, nicht `internal*`) | ⚠️ halbfertig |
| `convex/plants.ts` | CRUD plants; Transfer/Delete; Threshold- und Charakter-Update; `getLatestSummary`/`getHistoricalSummaries` mit Index-Order statt Memory-Sort | ✅ fertig |
| `convex/plant_species.ts` | Suche + Seed-Logik für Pflanzenarten-DB | ✅ fertig |
| `convex/seed_plants.ts` | 95 kuratierte Pflanzenarten (Seed-Datensatz) | ✅ fertig |
| `convex/sensors.ts` | registerSensor, getSensorStatus (mit last_seen-Alterslogik), setSensorStatus, updateLastSeen | ✅ fertig |
| `convex/users.ts` | createUser, updateUserSettings, Push-Token, Telegram-Connect-Flow (Code-basiert), isDevUser | ✅ fertig |
| `convex/messages.ts` | Inbox-CRUD; createMessage/updateMessageText bewusst ohne Auth-Check (Kommentar: nur intern genutzt), aber als öffentliche `mutation` implementiert | ⚠️ halbfertig |
| `convex/migrations.ts` | Einmalige Migration legacy Notification-Flags → `notification_rules`-Objekt | ✅ fertig (Einmal-Migration) |
| `convex/auth.config.ts` | Clerk-JWT-Provider-Konfiguration für Convex | ✅ fertig |

### Backend (Node.js / Hono)

| Pfad | Aufgabe | Status |
|------|---------|--------|
| `backend/src/index.ts` | Hono App; Status-Route; Mount `/dev`, `/notifications`, `/sensor`, `/telegram`; CronJob-Start | ✅ fertig |
| `backend/src/config.ts` | ENV-Loader; erzwingt CONVEX_URL/CLERK_SECRET_KEY/INTERNAL_WEBHOOK_SECRET beim Start | ✅ fertig |
| `backend/src/jobs/cronJob.ts` | node-cron Scheduler; iteriert Sensoren mit heutigen Readings ohne Summary | ✅ fertig |
| `backend/src/lib/processor.ts` | Median/State-Berechnung, Inbox-Message-Erstellung, Kontaktzeitfenster-Filter, Eskalationszähler, n8n-Webhook-Trigger | ✅ fertig |
| `backend/src/lib/analysis.ts` | Median/State-Funktionen; `getEscalationMessage()` ist toter Code (nirgends aufgerufen, Ersatz durch n8n+Claude) | ⚠️ halbfertig (Altlast) |
| `backend/src/lib/auth.ts` | `clerkAuthMiddleware`: echte Bearer-Token-Verifizierung via `@clerk/backend` | ✅ fertig |
| `backend/src/lib/convex.ts` | ConvexHttpClient Singleton + Factory mit Auth-Token | ✅ fertig |
| `backend/src/lib/sensorProblem.ts` | Setzt Sensor-Status auf `needs_remeasurement`, erstellt System-Message, triggert n8n-System-Webhook | ✅ fertig |
| `backend/src/routes/devmode.ts` | `/dev/info`, `/dev/simulate` (8 Szenarien), `/dev/time-travel`, `/dev/trigger-cron`, `/dev/trigger-sensor-problem`; alle hinter `clerkAuthMiddleware` + `isDevUser`-Check | ✅ fertig |
| `backend/src/routes/notifications.ts` | `/notifications/update-inbox`: n8n-Callback zum Setzen des finalen Nachrichtentexts, statisches Bearer-Secret | ⚠️ halbfertig (Shared-Secret-Modell) |
| `backend/src/routes/sensor.ts` | `/sensor/problem`: öffentlicher Endpoint ohne jegliche Authentifizierung | ❌ Sicherheitslücke |
| `backend/src/routes/telegram.ts` | Telegram-Webhook; verarbeitet `/start <code>`, verbindet `telegram_chat_id`; kein Secret-Token-Check auf dem Webhook selbst | ⚠️ halbfertig |

### Mobile App (Expo / React Native)

| Pfad | Aufgabe | Status |
|------|---------|--------|
| `mobile/app/_layout.tsx` | Root Layout; ClerkProvider + ConvexProviderWithClerk; PushTokenRegistration; Notification-Handler | ✅ fertig |
| `mobile/app/index.tsx` | Auth-Guard Redirect | ✅ fertig |
| `mobile/app/(auth)/sign-in.tsx` | Login; Password + MFA (email_code/phone_code) | ✅ fertig |
| `mobile/app/(auth)/sign-up.tsx` | Registrierung; Email-Verifizierung; Pwned-Password-Erkennung | ✅ fertig |
| `mobile/app/(home)/_layout.tsx` | Stack inkl. plant-list, inbox, add-plant, global-settings, plant-settings | ✅ fertig |
| `mobile/app/(home)/index.tsx` | Post-Login: auto createUser; Redirect zu plant-list oder onboarding je nach Pflanzenanzahl | ✅ fertig |
| `mobile/app/(home)/onboarding.tsx` | Erste Pflanze registrieren; Speciessuche/manuell; Sensor-ID fest vorbelegt mit `fake-sensor-001` | ⚠️ halbfertig |
| `mobile/app/(home)/plant-list.tsx` | Übersicht aller Pflanzen mit Status-Badge, Inbox-Button mit Unread-Badge | ✅ fertig |
| `mobile/app/(home)/add-plant.tsx` | Neue Pflanze mit/ohne Sensor, Sensor-Transfer mit Lösch-/Behalten-Dialog | ✅ fertig |
| `mobile/app/(home)/status.tsx` | MetricCards, Sensor-Status-Pill, Historien-Chart (victory-native + Skia), Custom-Zeitraum | ✅ fertig |
| `mobile/app/(home)/plant-settings.tsx` | Name, Charakter (happy/grumpy/neutral), Schwellenwerte pro Pflanze | ✅ fertig |
| `mobile/app/(home)/global-settings.tsx` | Messzeit, Notification Rules pro State/Kanal, Kontaktzeitfenster, Telegram-Connect, Username, Telefonnummer (ungenutzt) | ✅ fertig |
| `mobile/app/(home)/devmode.tsx` | Dev Tools: Single/Multi-Sensor-Simulation, Sensor-Problem-Trigger, Zeitreise-Tab, Debug-Panel | ✅ fertig |
| `mobile/components/devmode/time-travel-tab.tsx` | Einzel- und Batch-Zeitreise mit lokaler State-Vorschau | ✅ fertig |
| `mobile/components/burger-menu.tsx` | Slide-Panel; Navigation; Dev-Tools-Link nur für `is_dev` | ✅ fertig |
| `mobile/components/clerk-runtime-warning.tsx` | Warnkomponente für Expo Go | ❌ nie verwendet (totes Code) |
| `mobile/components/themed-text.tsx` / `themed-view.tsx` | Theme-Wrapper (nutzen `useThemeColor`, unterstützen Light/Dark) | ✅ fertig, aber ungenutzt außerhalb Collapsible |
| `mobile/components/ui/collapsible.tsx` | Collapsible UI-Komponente | ✅ fertig, nirgends im aktiven Screen-Code eingebunden |
| `mobile/components/ui/icon-symbol(.ios).tsx` | Icon-Wrapper (SF Symbols/Material Icons) | ✅ fertig, nirgends im aktiven Screen-Code eingebunden |
| `mobile/constants/colors.ts` / `theme.ts` | Farbpaletten light+dark; alle Screens nutzen weiterhin hart `Colors.dark` | ⚠️ halbfertig (kein Theme-Switching) |

### Python Tooling

| Pfad | Aufgabe | Status |
|------|---------|--------|
| `fake_sensor.py` | 18 Readings direkt per POST an `CONVEX_HTTP_URL/readings`; Random-Walk-Simulation | ✅ fertig |

### Sonstiges

| Pfad | Aufgabe | Status |
|------|---------|--------|
| `seed_script.mjs` | Einmal-Skript zum Seeden von `docs/plants.json` in `plant_species` | ✅ fertig |
| `firmware/d1_mini/` | Vorgesehener ESP32-Firmware-Ordner | ❌ fehlt noch (leeres Verzeichnis) |

---

## 4. Was funktioniert end-to-end

**Auth-Flow**
`sign-up.tsx` → Clerk `signUp.password()` → Email-Code-Verifizierung → `finalize()` → Redirect `/(home)`. `sign-in.tsx` unterstützt zusätzlich MFA (`email_code`/`phone_code`) über `signIn.mfa.*`.

**User- und Pflanzen-Provisioning**
`(home)/index.tsx` legt bei erstem Login automatisch einen `users`-Eintrag an (`api.users.createUser`) und leitet abhängig von `plants.length` zu `onboarding` oder `plant-list` weiter.

**Sensor-Registrierung + Multi-Plant**
`onboarding.tsx`/`add-plant.tsx` → `api.sensors.registerSensor` → `api.plants.createPlant` (mit optionaler Speciesauswahl aus `plant_species`, die Default-Schwellenwerte übernimmt). `add-plant.tsx` unterstützt zusätzlich Pflanzen ohne Sensor sowie Sensor-Transfer zwischen Pflanzen inklusive Warndialog (`Alert.alert` mit "Pflanze löschen"/"Pflanze behalten").

**Daten-Ingestion**
`fake_sensor.py` und `devmode.tsx:sendScenario()`/`time-travel-tab.tsx` senden Readings bzw. direkt Tageszusammenfassungen an Convex.

**CronJob-Verarbeitung + Eskalation**
`cronJob.ts:runCronJobOnce()` → `processor.ts:processSessionIfReady()` berechnet Median je Dimension, klassifiziert States, schreibt `daily_summaries`, aktualisiert `consecutive_critical_days` via `plants.incrementCriticalDays`/`resetCriticalDays`, erstellt einen Platzhalter-Eintrag in `messages` und meldet den Vorgang per Webhook an n8n (`notifyN8nIfNeeded`), das den finalen Text via Claude generiert und über `/notifications/update-inbox` zurückschreibt.

**Kontaktzeitfenster**
`processor.ts:isOutsideContactWindow()` unterdrückt externe Benachrichtigungen (nicht die Inbox-Eintragserstellung) außerhalb des in `global-settings.tsx` konfigurierten Zeitfensters; Dev Mode kann das über `override_contact_window` umgehen.

**Sensor-Problem-Flow**
`backend/src/routes/sensor.ts` (echter Sensor) bzw. `devmode.tsx:triggerSensorProblem()` (Dev Mode) → `handleSensorProblem()` setzt `sensors.status = 'needs_remeasurement'`, erzeugt eine System-Message und benachrichtigt über den n8n-System-Webhook.

**Inbox**
`inbox.tsx` zeigt alle Nachrichten realtime via `api.messages.getMessagesByClerkId`; `plant-list.tsx` zeigt ein Unread-Badge via `api.messages.getUnreadCount`; `markAsRead` beim Antippen einer Nachricht.

**Push Notifications (Registrierung)**
`app/_layout.tsx:PushTokenRegistration` fordert bei Login Berechtigung an, holt den Expo-Push-Token und speichert ihn via `api.users.updatePushToken`. Die tatsächliche Zustellung erfolgt extern über n8n mit dem gespeicherten Token.

**Telegram-Verbindung**
`global-settings.tsx:handleConnectTelegram()` generiert einen 6-stelligen Code (`generateTelegramConnectCode`) und öffnet den Telegram-Deep-Link; `telegram.ts:webhook` verarbeitet `/start <code>` und verknüpft `telegram_chat_id` mit dem User.

**Status Screen + Historie**
`status.tsx` zeigt aktuelle MetricCards, Sensor-Status (`getSensorStatus`, abgeleitet aus `last_seen`-Alter bzw. `needs_remeasurement`-Flag) und ein interaktives Liniendiagramm (`victory-native` + `@shopify/react-native-skia`) über `getHistoricalSummaries` mit 7-/14-Tage- und Custom-Range-Auswahl.

**Dev Mode**
Vollständig auf Clerk-Bearer-Auth umgestellt (`clerkAuthMiddleware` + `isDevUser`-Query); unterstützt Single-Sensor-, Multi-Sensor- und Zeitreise-Tests inklusive Batch-Zeitreise über mehrere Tage mit Szenario-Presets (fallend/steigend/critical/ok/random).

---

## 5. Feature Completeness gegen Product Spec

### 1. Onboarding

| Feature | Status | Anmerkung |
|---|---|---|
| Account + Email-Bestätigung | ✅ fertig | Clerk-Flow vollständig |
| Bluetooth Sensor-Pairing (ESP32) | ❌ fehlt | Keine Firmware; Sensor-ID wird manuell als Text eingegeben |
| Sensor → Pflanze aus DB wählen | ✅ fertig | Speciessuche in `plant_species` (95 Arten) |
| Pflanzenspezifische Default-Schwellenwerte | ✅ fertig | `createPlant` übernimmt Species-Defaults |
| Schwellenwerte individuell anpassen | ✅ fertig | `plant-settings.tsx` |
| Messzeit konfigurierbar | ⚠️ teilweise | Wert wird gespeichert (`users.measure_time`), aber kein Firmware-Verbrauch; Cron läuft global auf festem Intervall, nicht pro User-Messzeit |
| Hinweis "3 Min Wartezeit" | ❌ fehlt | Kein entsprechender Onboarding-Screen |
| Manueller Mess-Trigger | ⚠️ teilweise | Nur als Dev-Mode-Simulation, kein echter Sensor-Trigger-Mechanismus in Produktions-UI |

### 2. Sensor-Logik

| Feature | Status | Anmerkung |
|---|---|---|
| Tägliche Messung (18 Readings/3 Min) | ✅ fertig (simuliert) | Nur über `fake_sensor.py`/Dev-Simulate, keine echte Firmware |
| Manueller Mess-Trigger aus App | ❌ fehlt | Nicht Teil der Produktions-UI (nur Dev Mode) |
| Sensor lädt Config bei Wakeup | ❌ fehlt | Keine Firmware vorhanden |
| Retry-Logik (3x/5 Min) | ❌ fehlt | Keine Firmware vorhanden |
| Benachrichtigung nach 3 Fehlschlägen | ✅ fertig (Backend-seitig) | `/sensor/problem` + `handleSensorProblem()`, aber Trigger kommt nur aus Dev Mode, da kein echter Sensor existiert |
| Follow-Up-Messung 30 Min später | ❌ fehlt | Nicht implementiert (weder Backend noch Firmware) |
| Danke-Nachricht bei Verbesserung | ⚠️ teilweise | Eskalationszähler wird zurückgesetzt (`resetCriticalDays`), aber keine explizite "Danke"-Nachrichtenlogik im Backend – Ton wird komplett an n8n/Claude delegiert |
| Eskalationslogik (3 Tage → dramatisch) | ⚠️ teilweise | `consecutive_critical_days` wird korrekt gezählt und an n8n übergeben; die eigentliche Tonalität liegt außerhalb des Repos bei Claude/n8n. `analysis.ts:getEscalationMessage()` ist verwaister Code aus einer früheren Implementierung |
| Wakeup-Logik (Timer/EXT0) | ❌ fehlt | Keine Firmware vorhanden |

### 3. Akku-Management

| Feature | Status | Anmerkung |
|---|---|---|
| Alle Akku-Features | 🔧 Hardware | Vollständig abhängig von Firmware/PCB, die noch nicht existiert; `sensors.status` kennt zwar `"charging"` als Literal, aber nichts im Backend setzt diesen Wert |

### 4. Benachrichtigungen

| Feature | Status | Anmerkung |
|---|---|---|
| Push Notification | ✅ fertig | Token-Registrierung im Client vollständig; Zustellung erfolgt extern via n8n |
| In-App-Nachricht (Inbox) | ✅ fertig | `inbox.tsx`, realtime, Read-Status |
| Telegram Text | ✅ fertig | Connect-Flow + Webhook vollständig; Zustellung extern via n8n |
| WhatsApp | ❌ fehlt | Kein Code vorhanden (spec-konform als Post-Beta markiert) |
| Telefonanruf | ❌ fehlt | UI zeigt "Anruf (Kommt bald)", deaktiviert; kein Backend-Code |
| Sprachnachricht (ElevenLabs) | ❌ fehlt | Kein Code vorhanden |
| Kanal wählbar pro State | ✅ fertig | `notification_rules` granular pro `ok`/`warning`/`critical` und Kanal |
| Frequenz wählbar | ❌ fehlt | Keine separate Frequenzsteuerung (nur Kontaktzeitfenster) |
| Kontaktzeitfenster | ✅ fertig | `contact_window_start/end`, Filter in `processor.ts`, UI in `global-settings.tsx` |
| Eskalationslogik Tag 1→2→3+ | ⚠️ teilweise | Zählung im Backend vorhanden, Tonalität komplett extern (n8n/Claude), nicht im Repo verifizierbar |
| KI-Persönlichkeit (3 Charaktere) | ✅ fertig | `happy`/`grumpy`/`neutral`, an n8n übergeben |
| KI-Charakter pro Pflanze | ✅ fertig | `plant-settings.tsx:updatePlantCharacter` |
| ElevenLabs-Stimme | ❌ fehlt | Kein Code vorhanden |

### 5. Multi-Plant Management

| Feature | Status | Anmerkung |
|---|---|---|
| Mehrere Pflanzen pro Account | ✅ fertig | `plant-list.tsx` |
| Mehrere Sensoren pro Account | ✅ fertig | Je Pflanze ein Sensor möglich |
| Sensor zwischen Pflanzen ummelden | ✅ fertig | `transferSensor` Mutation + UI-Flow |
| Quellpflanze behalten (ohne Sensor) | ✅ fertig | `removeSensorFromPlant`/Transfer-Flow |
| Quellpflanze löschen mit Warndialog | ✅ fertig | `Alert.alert` in `add-plant.tsx` |
| Warnung historische Daten gehen verloren | ⚠️ teilweise | Dialog warnt nicht explizit vor Datenverlust, nur allgemein vor Löschen |
| Sensor-Transfer ohne historische Daten | ✅ fertig | `daily_summaries` bleiben an `sensor_id` (=device_id) gebunden, nicht an Plant-Dokument |
| Pflanze ohne Sensor anlegen | ✅ fertig | `add-plant.tsx` Schritt "Ohne Sensor" |

### 6. Pflanzendatenbank

| Feature | Status | Anmerkung |
|---|---|---|
| Auswahl aus vorhandener Liste | ✅ fertig | Eigene kuratierte DB statt OpenFarm (spec-Empfehlung umgesetzt), 95 Arten |
| Pflanzenspezifische Default-Schwellenwerte | ✅ fertig | `moisture_warning`/`temperature_min/max`/`light_min/max` je Art |
| Manuelle Pflanze anlegen | ✅ fertig | Fallback bei fehlendem Suchtreffer |
| Schwellenwerte individuell überschreibbar | ✅ fertig | `plant-settings.tsx` |

### 7. Status Screen

| Feature | Status | Anmerkung |
|---|---|---|
| Aktueller Status pro Dimension | ✅ fertig | MetricCards |
| Median + State Badge | ✅ fertig | |
| Letztes Update mit Zeitstempel | ✅ fertig | |
| Sensor-Status aktiv/offline/lädt/... | ⚠️ teilweise | `active`/`inactive`/`offline`/`needs_remeasurement`/`unknown` implementiert; `"charging"`/`"measuring"` sind im Schema definiert, werden aber nie gesetzt (keine Firmware) |
| Akkustand mit Live-Update | ❌ fehlt | Kein Akkufeld im Schema, keine UI-Anzeige |
| Historischer Verlauf | ✅ fertig | Deutlich über Spec hinaus: interaktives Chart mit Tooltip, Metrik-Toggle, Zeitraum-Presets und Custom-Range |
| Pflanzenliste mit Schnellübersicht | ✅ fertig | `plant-list.tsx` |

### 8. Einstellungen

| Feature | Status | Anmerkung |
|---|---|---|
| Benachrichtigungskanal wählen | ✅ fertig | |
| Kontaktzeitfenster einstellen | ✅ fertig | |
| Schwellenwerte pro Pflanze | ✅ fertig | |
| Messzeit konfigurieren | ⚠️ teilweise | Wird gespeichert, aber ohne Firmware-Konsumenten wirkungslos |
| Telefonnummer hinterlegen | ⚠️ teilweise | Feld existiert und ist in der UI editierbar, aber ohne jede Funktion (Call-Feature nicht implementiert) |
| KI-Charakter pro Pflanze | ✅ fertig | |
| Account verwalten | ⚠️ teilweise | Nur Username änderbar; kein Email-/Passwort-Change-Flow in der App (Clerk würde das unterstützen) |
| Logout | ✅ fertig | |

### 9. Premium Modell

| Feature | Status | Anmerkung |
|---|---|---|
| Alle Basic-/Pro-Features für Beta freigeschaltet | ✅ fertig | Kein Paywall-Code vorhanden, `users.plan` hardcoded `"basic"`, keine Checks – spec-konform für Beta |
| Stripe-Integration | ❌ fehlt | Erwartungsgemäß (Post-Beta laut Spec) |

### 10. OTA Firmware Updates

| Feature | Status | Anmerkung |
|---|---|---|
| Alle OTA-Features | 🔧 Hardware | Vollständig abhängig von Firmware, die nicht existiert; `sensors.firmware_version` im Schema vorhanden, aber nie befüllt |

---

## 6. Production Readiness

| Komponente | Production Ready? | Was fehlt konkret |
|---|---|---|
| Convex Schema | Bedingt | `plants.device_id`/`sensor_id`-Duplikat weiterhin vorhanden; `sensors.firmware_version` nie befüllt |
| Sensor-HTTP-Endpoint (`POST /readings`) | Nein | Weiterhin kein API-Key/HMAC, kein Rate Limiting; jeder kennt die öffentliche Convex-URL aus dem Mobile-Bundle |
| Convex "backend-only" Mutationen/Queries | Nein | `messages.createMessage`, `messages.updateMessageText`, `readings.*`, `sensors.updateLastSeen`, `sensors.setSensorStatus` sind als normale `mutation`/`query` (nicht `internalMutation`/`internalQuery`) implementiert und damit von jedem Client mit der Convex-URL direkt aufrufbar – die Kommentare "intentionally no auth check, backend-only" sind keine technische Durchsetzung |
| `/sensor/problem` Backend-Route | Nein | Komplett unauthentifiziert; jeder kann für eine beliebige `device_id` eine System-Nachricht + n8n-Benachrichtigung auslösen |
| `/notifications/update-inbox` | Bedingt | Statisches Shared-Secret (`INTERNAL_WEBHOOK_SECRET`) statt pro-Request-Signatur; ausreichend für Beta, nicht für Scale |
| Telegram-Webhook | Bedingt | Kein Telegram-`secret_token`-Header-Check; jeder, der die Webhook-URL kennt, kann Fake-Updates senden (Impact gering, da nur `connectTelegramByCode` mit gültigem Code greift) |
| Dev-Mode-Auth | Ja | Deutliche Verbesserung ggü. Phase 3: echte Clerk-JWT-Verifizierung statt Header-Spoofing |
| CronJob-Backend | Bedingt | Kein Dockerfile, kein Prozessmanager, keine Health-Checks; Intervall weiterhin über `.env` mit Dev-Default-Charakter |
| Processor | Ja | Idempotent (`already_processed`-Check), Median korrekt, jetzt mit Eskalations- und Kontaktzeitfenster-Logik |
| Analysis (Thresholds) | Bedingt | Globale Analysis-Schwellen (`analysis.ts`) und individuelle Plant-Thresholds (`plants.moisture_threshold` etc.) existieren parallel, werden aber nicht konsistent verwendet – `processor.ts` nutzt ausschließlich die globalen `analysis.ts`-Funktionen, die pro-Pflanze-Schwellenwerte aus `plant-settings.tsx` fließen nirgends in die State-Berechnung ein |
| Mobile Auth | Ja | MFA, Pwned-Password-Check, kein sichtbarer Debug-Text mehr im Sign-in (behoben ggü. Phase 3) |
| Mobile Status/Multi-Plant | Ja | Vollständiger Multi-Plant-Support seit Phase 3 behoben |
| Mobile Onboarding | Nein | Sensor-ID weiterhin freies Textfeld mit Default `fake-sensor-001`, kein QR-/BLE-Pairing |
| Mobile Dev Mode | Bedingt | Tailscale-IP weiterhin hardcodiert als Fallback-Kandidat; funktioniert aber korrekt mit Bearer-Auth |
| Notifications | Bedingt | Push-Registrierung und Zustellungs-Infrastruktur vorhanden, aber tatsächliche Zustellung liegt vollständig außerhalb des Repos (n8n) – nicht im Code verifizierbar/testbar |
| Datenhaltung | Nein | `daily_summaries` und `messages` wachsen unbegrenzt, kein TTL/Cleanup; Raw Readings werden nach Verarbeitung weiterhin gelöscht |
| Dark Mode Only | Nein | Unverändert: alle Screens importieren `Colors.dark` hart, Light-Palette ungenutzt |
| Umgebungstrennung | Nein | Weiterhin eine gemeinsame Convex-Instanz für Dev und Prod |
| Firmware/Hardware | Nein | Nicht vorhanden; gesamte Sensor-Logik nur simuliert |

---

## 7. Offene Vulnerabilities

| Name | Beschreibung | Priorität | Warum aktuell noch okay |
|---|---|---|---|
| **Unauthenticated Sensor Ingestion** (`POST /readings`) | Convex-HTTP-Endpoint validiert nur das Schema, nicht die Herkunft; jeder mit der Convex-URL (im Mobile-Bundle sichtbar) kann beliebige Readings für beliebige `sensor_id` einspeisen | Hoch | Einzelentwickler-Projekt, keine öffentliche Distribution, keine Sensoren im Feld |
| **Öffentlich aufrufbare "backend-only" Convex-Funktionen** | `messages.createMessage`/`updateMessageText`, `readings.*`, `sensors.updateLastSeen`/`setSensorStatus` sind reguläre `mutation`/`query`, nicht `internalMutation`/`internalQuery`; jeder Client mit der Convex-URL kann z. B. beliebige Inbox-Nachrichten für fremde `clerk_id` erzeugen oder Sensor-Status manipulieren | Hoch | Bisher kein bekannter Missbrauch, kleine Nutzerzahl (Beta), Convex-URL nicht aktiv beworben |
| **`/sensor/problem` ohne Authentifizierung** | Öffentliche Backend-Route; jeder kann für eine beliebige `device_id` eine System-Nachricht + n8n-Alert auslösen (Spam-Potenzial gegen echte Nutzer, falls `device_id` bekannt ist) | Mittel | `device_id`s sind aktuell nicht erratbar/enumerierbar, kleine Nutzerbasis |
| **Fehlendes Rate Limiting** | Weder `/readings`, `/sensor/problem` noch `/dev/*` haben Rate Limiting | Mittel | Convex-eigene API-Limits als implizites Schutzniveau, geringe Nutzerzahl |
| **Statisches Shared Secret für n8n-Callback** | `INTERNAL_WEBHOOK_SECRET` ist ein einzelner Bearer-Token ohne Rotation/Scope; bei Leak kann jeder beliebige Message-Texte in fremde Inboxen schreiben | Mittel | Secret nur zwischen Backend und selbstgehostetem n8n geteilt, kein Public Exposure |
| **Telegram-Webhook ohne Secret-Token-Validierung** | Telegram unterstützt einen `secret_token`-Header zur Webhook-Absicherung, der hier nicht geprüft wird; ein Angreifer könnte gefälschte Telegram-Updates senden | Niedrig | Missbrauch ist auf das Ausprobieren gültiger Connect-Codes beschränkt (6-stellig, aber kollisionssicher generiert, unklare Rate-Limitierung für Brute-Force) |
| **Tailscale-IP hardcodiert im App-Code** | `devmode.tsx` enthält weiterhin eine feste interne IP als Fallback-Kandidat | Niedrig | Nur im Dev-Build aktiv, kein Production-Impact |
| **Test-Publishable-Key in `.env`** | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` ist ein `pk_test_`-Key im Repo | Niedrig | Publishable Keys sind laut Clerk-Design für Client-Exposition vorgesehen und domain-beschränkt |

---

## 8. Bekannte Bugs und Schwächen

**Pro-Pflanze-Schwellenwerte fließen nicht in die Zustandsberechnung ein**
`plant-settings.tsx` erlaubt individuelle `moisture_threshold`/`temperature_threshold_min/max`/`light_threshold_min/max` pro Pflanze, aber `backend/src/lib/processor.ts` klassifiziert States ausschließlich über die globalen, hartkodierten Grenzwerte in `analysis.ts` (`getMoistureState`, `getTemperatureState`, `getLightState`). Nutzer, die individuelle Schwellenwerte setzen, sehen keinerlei Effekt auf Badges oder Benachrichtigungen – die Funktion täuscht Wirkung vor, die nicht existiert.

**`analysis.ts:getEscalationMessage()` ist verwaister Code**
Seit die Nachrichtengenerierung an n8n/Claude ausgelagert wurde, wird diese Funktion nirgends mehr aufgerufen. Sie deutet auf eine frühere, inzwischen ersetzte Implementierung hin und sollte entfernt oder das Modul aktualisiert werden, um Verwirrung zu vermeiden.

**Doppelte ID-Felder in `plants` weiterhin vorhanden**
`device_id` und `sensor_id` werden weiterhin redundant auf denselben Wert gesetzt (`createPlant`, `transferSensor`). Zahlreiche Queries (`getPlantByDeviceId`, `getPlantsBySensorId`, `getOwnedPlantByDeviceId`) müssen deshalb beide Felder gegenprüfen – seit Phase 3 unverändert.

**`getPlantsWithLatestSummaries` und ähnliche Queries laden alle Plants/Summaries in Memory**
`convex/plants.ts:getPlantsWithLatestSummaries()` und `getOwnedPlantByDeviceId()` nutzen weiterhin `.collect()` über die komplette `plants`- bzw. `daily_summaries`-Tabelle und filtern in JavaScript, statt Indizes zu nutzen. Bei wachsender Nutzerzahl skaliert das nicht.

**`console.log` in Produktionscode**
`plant-list.tsx` enthält ein permanentes `console.log('unreadCount:', unreadCount)`, das offensichtlich ein Debug-Leftover ist.

**Kontaktzeitfenster gilt nur für externe Zustellung, nicht konsistent kommuniziert**
`processor.ts` unterdrückt bei `type === 'plant_message'` außerhalb des Fensters die n8n-Benachrichtigung (Push/Telegram), erstellt aber überhaupt keinen Inbox-Eintrag in diesem Fall (die Funktion gibt vor dem `createMessage`-Call `null` zurück) – das weicht vom Verhalten "Inbox-Eintrag ja, externe Zustellung nein" ab, das man aus der UI-Beschreibung erwarten würde, und ist im Code nicht dokumentiert.

**`ClerkRuntimeWarning`, `Collapsible`, `IconSymbol`-Komponenten weiterhin totes/ungebundenes Code**
Unverändert seit Phase 3: `clerk-runtime-warning.tsx` wird nirgends importiert; `collapsible.tsx` und `icon-symbol(.ios).tsx` sind Boilerplate aus dem Expo-Router-Template und werden von keinem aktiven Screen verwendet.

**Dark Mode weiterhin hardcodiert**
Trotz vollständiger Light-Palette in `colors.ts` importieren alle Screens `Colors.dark` direkt; System-Theme wird ignoriert.

**Telefonnummer-Feld ohne Funktion**
`global-settings.tsx` zeigt ein editierbares Telefonnummer-Feld, das gespeichert wird (`users.phone_number`), aber nirgends im Backend oder n8n-Payload verwendet wird (Call-Feature nicht implementiert) – potenziell verwirrend für Beta-Tester, die denken, damit sei das Anruf-Feature aktivierbar.

**Sensor-Status-Alterslogik uneinheitlich mit Schema**
`sensors.ts:getSensorStatus()` berechnet `active`/`inactive`/`offline` aus dem Alter von `last_seen`, obwohl das Schema zusätzlich `"charging"` und `"measuring"` als mögliche `status`-Werte definiert, die nirgends gesetzt werden – diese beiden Zustände sind im Frontend (`status.tsx:getSensorStatusConfig`) nicht einmal abgebildet, obwohl `SensorStatusState` sie nicht auflistet (Typ-Inkonsistenz zwischen Schema und Frontend-Union-Type).

---

## 9. Nächste Schritte

### Sofort (nächste Session)

1. **Pro-Pflanze-Schwellenwerte in `processor.ts` verdrahten** – `analysis.ts`-Funktionen müssen die individuellen `moisture_threshold`/`temperature_threshold_min/max`/`light_threshold_min/max` der jeweiligen Pflanze statt fixer globaler Konstanten verwenden; aktuell größte funktionale Lücke, da UI Wirkung suggeriert, die nicht existiert
2. **"Backend-only" Convex-Funktionen auf `internalMutation`/`internalQuery` umstellen** – betrifft `messages.createMessage`/`updateMessageText`, `readings.*`, `sensors.updateLastSeen`/`setSensorStatus`; schließt die größte offene Vulnerability technisch statt nur per Kommentar
3. **`/sensor/problem` absichern** – mindestens HMAC-Signatur oder Shared Secret analog zu `/notifications/update-inbox`
4. **`analysis.ts:getEscalationMessage()` entfernen** – toter Code, verwirrend für neue Entwickler
5. **`console.log` in `plant-list.tsx` entfernen**

### Diese Woche

6. **Telegram-Webhook mit `secret_token`-Header absichern**
7. **Sensor-Endpoint-Authentifizierung für `POST /readings`** – API-Key pro Sensor oder HMAC, weiterhin nicht umgesetzt seit Phase 3
8. **`daily_summaries`/`messages` TTL oder Pagination** – unbegrenztes Wachstum vermeiden
9. **`plants.sensor_id`-Duplikat konsolidieren** – Migration auf ausschließlich `device_id`
10. **Telefonnummer-Feld ausblenden oder mit Hinweis "kommt bald" versehen**, bis Call-Feature existiert

### Nächste Wochen

11. **Erste ESP32-Firmware** – `firmware/d1_mini/` ist leer; das ist der größte Block zwischen aktuellem Stand und echtem Beta-Betrieb (Bluetooth-Pairing, Wakeup-Logik, Akku-Messung)
12. **Deployment-Setup Backend** – Dockerfile, Prozessmanager, Health-Checks
13. **Umgebungstrennung** – zweites Convex-Deployment für Produktion
14. **QR-/BLE-Onboarding statt freier Sensor-ID-Eingabe**
15. **Sensor-Status-Typen (`charging`/`measuring`) konsistent zwischen Schema und Frontend abbilden**, sobald Firmware diese liefert

---

## 10. Offene Architektur-Entscheidungen

**Wo lebt die State-Klassifizierungslogik?**
Aktuell existieren zwei parallele, unverbundene Schwellenwert-Systeme: globale Konstanten in `backend/src/lib/analysis.ts` und individuelle Pflanzen-Schwellenwerte in `convex/schema.ts`/`plant-settings.tsx`. Es muss entschieden werden, ob `analysis.ts` komplett auf pro-Pflanze-Werte umgestellt wird (mit globalen Werten nur als Fallback für Pflanzen ohne Species-Zuordnung) oder ob die individuelle Einstellbarkeit aus der UI entfernt wird, bis sie implementiert ist.

**n8n/Claude als externe Abhängigkeit für Kernfunktionalität**
Die eigentliche Nachrichtengenerierung (inkl. Eskalationston) liegt vollständig außerhalb des Repos in einem n8n-Workflow mit Claude-Integration. Das bedeutet: Kernverhalten des Produkts ("Pflanze redet mit Persönlichkeit") ist aus dem Code selbst nicht mehr nachvollziehbar oder testbar. Zu entscheiden: Soll der n8n-Workflow (zumindest als Export/Konfiguration) versioniert und Teil des Repos werden, um Nachvollziehbarkeit und Testbarkeit sicherzustellen?

**Convex-Sicherheitsmodell für "interne" Funktionen**
Der wiederkehrende Kommentar "intentionally no auth check, backend-only" in mehreren Convex-Dateien zeigt ein ungelöstes Architekturproblem: Convex unterscheidet technisch zwischen öffentlichen (`mutation`/`query`) und internen (`internalMutation`/`internalQuery`) Funktionen, aber das Team nutzt bisher ausschließlich öffentliche Funktionen mit Kommentar-Konvention statt echter Durchsetzung. Diese Entscheidung sollte bewusst und einheitlich getroffen werden, nicht schrittweise.

**Sensor-Auth-Strategie weiterhin unentschieden**
Wie in Phase 3: Pre-shared API-Key, HMAC-Signatur oder mTLS für `POST /readings` – weiterhin nicht entschieden. Relevanter denn je, sobald echte Firmware existiert.

**Firmware-Protokoll**
HTTP-POST-Direktanbindung an Convex ist für batteriebetriebene ESP32-Sensoren energetisch ineffizient. MQTT, CoAP oder ein Backend-Relay sind Alternativen – diese Entscheidung ist blockierend für den Beginn der Firmware-Entwicklung und wurde seit Phase 3 nicht getroffen.

**Rolle der Messzeit (`users.measure_time`)**
Das Feld wird in der UI gepflegt und in Convex gespeichert, hat aber aktuell keinen Konsumenten – weder im Cron (der auf festem Intervall über alle Sensoren läuft) noch in einer Firmware. Es muss geklärt werden, ob die Messzeit künftig pro Sensor die Firmware-Wakeup-Zeit steuert (wie in der Spec vorgesehen) oder ob das Datenmodell überarbeitet wird.

**Datenretention für Charts**
Mit dem neuen Historien-Chart wächst der Bedarf an `daily_summaries` über Monate. Gleichzeitig gibt es kein Cleanup-Konzept. Es muss entschieden werden, ob (a) Rohdaten-Retention-Regeln eingeführt werden, (b) ältere Summaries aggregiert (z. B. wöchentlich) werden, oder (c) unbegrenztes Wachstum für die Beta-Größenordnung bewusst akzeptiert wird.
