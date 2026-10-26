# Callgreen: Projektstand

Stand: 2026-10-26 · Einstieg für jede neue Session. Bei Widerspruch gilt der Code.

Ältere Übergabedokumente (Wissensstand 14.–17.10., teils überholt) liegen unter `~/.claude/uploads/cf98ec16-12b3-5c17-931f-b6986cd73174/`: `tpm_dev_final.md`, `pcb_dev_final.md`, `software_dev_final.md`, `software_dev_vsc_final.md`, `firmware_final.md`. Dieses Dokument fasst sie zusammen und ergänzt den Teststand vom 22./23.10.

Keine Secrets in diesem Dokument (PoP, Tokens, `FIRMWARE_ADMIN_SECRET`, WLAN-Daten, Webhook-URLs).

---

## 1. Produkt in Kürze

- **Callgreen** (intern und im Repo noch „Planty“): akkubetriebener Bodensensor, Zielpreis ca. 25 €, Herstellkosten-Ziel 8–12 €.
- Misst Bodenfeuchte, Lufttemperatur/-feuchte, Licht, Akku. Die Pflanze meldet sich mit Charakter (`happy` Fröhlich, `grumpy` Genervt/Grummelig, `neutral` Gelassen) per Push und Telegram, später per Anruf.
- Zielgruppe: Menschen ohne Pflanzenerfahrung. Markt DACH, Startnext-Crowdfunding, TikTok.
- Unternehmen: UG mit Co-Founder in Vorbereitung, EXIST im Blick. Stand seit August unbekannt.
- Arbeitsweise: Deutsch, knapp, entlang des User-Flows. Commits nur auf Ansage. Produktentscheidungen trifft Hannes.

## 2. Systemüberblick

```
Sensor (ESP32-C3, Platine v3, Firmware 7.0.10)
  │ BLE: Espressif Provisioning, Security 1 + PoP, Endpoints claim/status  ◄── App (Expo, mobile/)
  │ HTTPS, Bearer device_token
  ▼
Convex Dev "dusty-shrimp-80" (eu-west-1)   ← einziges Deployment, kein Prod
  ├─ /device/claim, /readings/batch, /device/commands(+/ack), /firmware/latest, /firmware/file/…
  ├─ Cron alle 15 min: checkSensorAlerts (Offline/Akku)
  └─ scheduler → Hono /process-session
        ▼
Hono-Prozessor backend/ (pm2 planty-backend, :3000, cloudflared planty-cloudflare → api.getplanty.de)
        ▼
n8n (Charaktertext per LLM, Kanalwahl, Versand)  ← NICHT im Repo
```

Zuständigkeiten: Convex = Daten, Validierung, HTTP, Auth. Hono = Auswertung, Eskalation, Außenkommunikation. n8n = Text und Versand. App = Darstellung (bekannte Verletzung: `getOverallTone` in der Pflanzenliste).

## 3. Infrastruktur und Abläufe

| Was | Wo / Wie |
|---|---|
| Repo | `/home/aedred/planty`, Branch `feature/firmware-v7-backend-app`, Push per SSH vom Server |
| Firmware | `firmware/callgreen-fw/`, Version nur in `CMakeLists.txt` (`PROJECT_VER`). `sdkconfig.defaults.local` (PoP) ist gitignored |
| Firmware bauen | auf dem Server, ESP-IDF v6.1 unter `~/esp/v6.1` |
| Firmware flashen | nur am Laptop (`C:\Users\marsk\planty`, `git pull`, `idf.py -p COM9 flash monitor`), **ohne NVS-Löschen** |
| OTA veröffentlichen | `cd ~/planty && FIRMWARE_ADMIN_SECRET='…' node scripts/publish_firmware.mjs firmware/callgreen-fw/build/callgreen_fw.bin <version> v3`, dann `npx convex run firmware:setReleaseRollout '{"version":"<v>","hw_rev":"v3","active":true,"rollout":["cg-00A5D8"]}'` |
| Claude RC | systemd-Dienst `claude-rc` (`claude remote-control --name planty-server`) |
| pm2 | `planty-backend`, `planty-convex`, `planty-cloudflare`, `planty-n8n`, `planty-metro` (:8081), `planty-web` (:8099) |
| UI im Browser | `http://100.86.32.59:8099` (Tailscale), DevTools-Handyansicht |
| Testgerät | Board 1 `cg-00A5D8` (BLE `CALLGREEN-00A5D8`), Board 2 für Akku-/WLAN-Tests |
| Messplan | Europe/Berlin: 0–5 Pause, 5–13 stündlich, 13–20 halbstündlich, 20–24 Pause. Nicht 20–5 Uhr testen |

## 4. Hardware (Platine v3)

- ESP32-C3-MINI-1-H4X, Lader ETA6003 (1 A), LDO HT7833, AHT20 (0x38), BH1750 (0x23), kapazitiver Feuchtesensor über P-FET, geschützte 18650 (3000 mAh, PCM, NTC).
- Pins: IO0 STAT (LOW = lädt), IO1 Akku-ADC (×2), IO4 Feuchte-ADC, IO5 VBUS (Wakeup), IO8/9 I²C, IO10 Sensor-Gate (LOW = an).
- `CONFIG_ESP_SLEEP_GPIO_ENABLE_INTERNAL_RESISTORS` muss **aus** bleiben (sonst kein USB-Wakeup an IO5).
- Gemessen: 55 µA Deep Sleep, Laden 0,84 A, Feuchte roh 2320 = trocken / 845 = nass (ein Exemplar, nur Luft/Wasser).
- v4 (nicht begonnen, Pins bleiben): IO5-Teiler 2,2k/3,3k, C13 in den Hot Loop, Silkscreen.

## 5. Firmware: Teststand (alles auf Hardware, 13.–23.10.)

| Bereich | Stand |
|---|---|
| Claim/BLE-Onboarding (Android) | bestanden |
| Batch, Puffer, Config, 401 | bestanden; 401 kommt nur noch einmal |
| Zeit-Sync | Fix 7.0.1 (SNTP-Wiederholung alle 2 s), im Akkubetrieb bestätigt |
| `measure_now`, `set_config` | bestanden |
| `set_wifi` (falsches Passwort, unbekannte SSID, Wechsel hin und zurück) | bestanden nach Fixes 7.0.2 und 7.0.9 (Speichern über Neustart) |
| OTA: normal, falsche Prüfsumme, Rollback (Release wird automatisch deaktiviert), Stromverlust, Akkugrenze | bestanden |
| `factory_reset` (inkl. Knopf in der App) | bestanden, `seq` läuft weiter |
| Sensor in App entfernen → Neukoppeln | bestanden |
| Router weg → BLE-Neukopplung | bestanden |
| Akkuschutz (`critical_battery_v`) | bestanden |
| Backoff | bestanden, Fix 7.0.10 (zu frühes Aufwachen) |

Aktuell auf dem Gerät: **7.0.10**. Akku-Schwellen entschieden: Firmware 3,4 / 3,2 V, Backend-Warnungen 3,5 / 3,3 V. Akkustand wird in der App in Prozent angezeigt (3,2 V = 0 %, ab 4,15 V = 100 %, geglättet).

## 6. Offene Punkte

### Als Nächstes
1. **Settle-Test in Erde** (`CONFIG_CALLGREEN_SETTLE_TEST`, danach `settle_ms` per Config setzen; aktuell 2000).
2. **Nachtdaten mit 7.0.10 prüfen**: keine Doppelmessungen, pünktliche Slots, `time_synced: true`.
3. **UI-Runde** im Browser entlang des User-Flows:
   - „Planty“ → „Callgreen“ (Logo, „Finde deinen Planty-Sensor“, alte Texte)
   - Onboarding: deutlich zeigen, mit welchem WLAN der Sensor schon verbunden ist
   - Dashboard-Platzhalter ohne Funktion: Filter, Standort, „Gegossen“, „Jetzt gießen“
   - Akku-Anzeige und Knopf „Werkseinstellungen“ optisch prüfen
   - Start-Spinner mit Timeout (~15 s, „Keine Verbindung“ + „Erneut versuchen“)
   - Pflanzenliste im Web ohne Login aufrufbar

### Restliche Tests
- Test 7: Netzwerkfehler (Internet in der FRITZ!Box sperren)
- Test 11: Nutzerwechsel (zweiter Account)
- Puffergrenze 24, `seq` nach Stromverlust
- iOS-Onboarding
- Zustellung der Offline-/Akku-Hinweise per Push und Telegram

### Backend
- **`NOTIFY_DRY_RUN` ist noch gesetzt** (Stand 26.10.). Live: `npx convex env remove NOTIFY_DRY_RUN`, vorher ggf. `alert_state` von `cg-00A5D8` zurücksetzen.
- Kontaktzeitfenster wird in **UTC-Stunden** gelesen statt Europe/Berlin (betrifft Pflanzen- und Sensormeldungen).
- Benachrichtigungen kommen mit v7 pro Messzyklus, begrenzt nur durch `max_notifications_per_day` (Standard 1). Bestätigen.
- n8n-Workflows exportieren und ins Repo (`n8n/`); prüfen, ob `battery_low`, `battery_critical`, `offline` verarbeitet werden.
- Convex-Plan klären (Free: 1 Mio. Aufrufe/Monat; ein Gerät dauerhaft am USB ≈ 518 000/Monat).
- Rollback-Benachrichtigung an Hannes (heute nur Log).
- Testdaten auf dev aufräumen (`cg-FFFFF*`, `test_*`, `hw_rev` `vtest`, Test-Releases 7.0.3–7.0.8).

### Vor einer Beta
- Prod-Deployment: Convex, Clerk-Prod, Hono-Betrieb dokumentieren, Firmware mit Prod-URL per OTA.
- Öffentliche Mutationen in `convex/http.ts` absichern (`createReading`, `createSensorLog`, `hello`), Rate-Limiting.
- v6-Ausnahme „ohne Authorization-Header“ in `/readings` und `/logs` entfernen.
- Clerk-SSO (Google/Apple) geht nicht.
- Root-`app.json` mit falscher EAS-ID löschen (wartet auf Okay).
- `EXPO_PUBLIC_ESP_POP` für EAS preview/production.

### Hardware und Messungen
- Strom pro Messzyklus und Akkulaufzeit messen.
- Brownout-Grenze messen, danach Akku-Schwellen ggf. anpassen.
- Externer Pull-up an IO0 (stromlos messen).
- Feuchte-Kalibrierung über mehrere Exemplare und Erdarten.
- AHT20 zeigt am USB ca. 3 °C mehr (Abwärme) → ggf. Layout v4.
- Datenblätter ETA6003, HT7833, Zelle; KiCad-Daten, BOM, CPL ins Repo.

### Vor Serie
- Gehäuse (Zuständigkeit offen; Zielform Kapsel ca. 3 × 3 × 15 cm)
- Platine v4, Fertiger und Flash-/Testablauf
- Secure Boot v2, Flash Encryption, signierte OTA, Firmware-Download absichern
- Convex-CA-Wechsel würde TLS brechen → Bundle per OTA nachlieferbar halten
- CE (RED, EMV), Akku-Transport
- Anruf-Feature (Asterisk, easybell, ElevenLabs), Twilio-Demo entfernen
- Umbenennung Planty → Callgreen (Repo, Bundle-ID, Domain, pm2)
- Zeitplan neu (November-Launch unrealistisch)

## 7. Fallen, die man kennen muss

- Firmware **ohne NVS-Löschen** flashen (sonst Token, WLAN, `seq` weg).
- Nach Änderungen an `sdkconfig.defaults` `sdkconfig` löschen; nie parallel zu einem laufenden Build/Monitor.
- Backend darf 400 nur bei wirklich kaputten Anfragen senden (Gerät verwirft bei jedem 4xx den Puffer) und nie `WWW-Authenticate`.
- Neue Firmware gilt erst nach dem ersten 200 als gültig; jeder Neustart vorher rollt zurück.
- PoP nur alphanumerisch (Expo ersetzt `$NAME` in `.env`).
- Tamagui 3: Pressability-Shim nur `.native`, jedes `Input` braucht explizites `borderRadius`, `pressStyle` gibt es nicht mehr.
- Endloser Ladekreis beim App-Start: zuerst Netzwerk/Tailscale prüfen.
- Zweites BLE-Onboarding im selben Boot erzwingt Neustart (gewollt).
