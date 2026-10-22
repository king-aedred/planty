# Übergabe an Backend und App: Schnittstelle Firmware v7

Stand: 13.10.2026. Verfasst aus Sicht der Firmware. Dieses Dokument beschreibt, was die Firmware v7 vom Backend (Convex) und von der App erwartet. Die Umsetzung im Backend und in der App ist frei, solange dieser Vertrag eingehalten wird. Abweichungen bitte an die Firmware-Seite zurückmelden, bevor die Firmware gebaut wird.

## 1. Kontext

- Gerät: Callgreen Sensor, ESP32-C3, Akku 3000 mAh, USB-C zum Laden. Kein Taster, keine LED, kein Display.
- Firmware v6 läuft aktuell und nutzt die alten Endpoints `/readings` (18 Einzel-POSTs pro Zyklus) und `/logs`. Diese bleiben bestehen, bis v7 auf allen Geräten läuft.
- v7 ändert: ein Request pro Messzyklus, Pufferung bei Ausfall, Geräte-Authentifizierung, BLE-Onboarding mit Kontozuordnung, Befehle an das Gerät, OTA.
- Base-URL: `https://dusty-shrimp-80.eu-west-1.convex.site` (oder neue, dann bitte mitteilen).
- Wichtig für TLS: Die Firmware vertraut der Zertifikatskette von `*.convex.site` (GTS Root R4). Liegen Firmware-Dateien für OTA auf einem anderen Host (z. B. `*.convex.cloud` Storage), bitte Host und Zertifikatskette mitteilen.

## 2. Gerätezustände (Firmware-Sicht)

| Zustand | Bedeutung |
|---|---|
| NEU | keine WLAN-Daten, kein Geräte-Token |
| AKTIV | WLAN-Daten und gültiges Geräte-Token vorhanden |
| NICHT ZUGEORDNET | WLAN-Daten vorhanden, aber Backend hat das Token abgelehnt (401) |

Verhalten:

| Situation | Verhalten |
|---|---|
| Akku, AKTIV | Messzyklus nach Plan, Deep Sleep dazwischen |
| Akku, WLAN nicht erreichbar | Backoff (30 min, 1 h, 2 h, max. 4 h), Messwerte werden gepuffert, kein BLE |
| Akku, NEU oder NICHT ZUGEORDNET | Deep Sleep, nur USB-Einstecken weckt |
| USB, AKTIV und WLAN verbunden | Online-Modus: wach, verbunden, fragt alle 10 s nach Befehlen |
| USB, kein WLAN oder NEU oder NICHT ZUGEORDNET | BLE-Onboarding aktiv, parallel weitere Versuche mit gespeichertem WLAN |

Das Gerät speichert keine Nutzerdaten. Die Zuordnung Gerät zu Nutzer existiert nur im Backend.

## 3. Geräte-ID und Authentifizierung

- `device_id`: aus der MAC-Adresse, Format `cg-XXXXXX` (6 Hex-Zeichen, Großbuchstaben). Nicht geheim.
- `device_token`: Geheimnis, das das Backend beim Claim ausstellt. Die Firmware speichert es im NVS und sendet es bei jedem Request als Header `Authorization: Bearer <device_token>`.
- Formate (festgelegt):
  - `claim_token`: 32 Zeichen Base32 (A bis Z, 2 bis 7), einmalig, 15 min gültig, an den Nutzer gebunden.
  - `device_token`: 43 Zeichen base64url (256 Bit Zufall), ohne Ablauf, wird nur bei einem neuen Claim ersetzt.
  - Die Firmware reserviert für beide Felder je 64 Zeichen. Längere Werte werden abgelehnt.
- Antwortet ein Endpoint mit **401**, gilt das Gerät als NICHT ZUGEORDNET: Token wird gelöscht, keine weiteren Sendeversuche bis zum nächsten Onboarding. WLAN-Daten bleiben erhalten.

## 4. Onboarding und Claim

### Ablauf

1. Nutzer ist in der App eingeloggt und tippt "Sensor hinzufügen".
2. App holt beim Backend einen **Claim-Token** (an den Nutzer gebunden, einmalig verwendbar, gültig z. B. 15 min).
3. Nutzer steckt den Sensor per USB an. Sensor startet BLE-Onboarding.
4. App verbindet sich per BLE, schickt Claim-Token und WLAN-Daten.
5. Sensor verbindet sich mit dem WLAN und ruft `POST /device/claim` auf.
6. Backend ordnet zu und gibt `device_token` zurück. Die App erfährt den Erfolg über das Backend (z. B. Sensor erscheint in der Geräteliste) und zusätzlich über den BLE-Status.

### POST /device/claim (ohne Authorization-Header)

Request:
```json
{
  "device_id": "cg-A1B2C3",
  "claim_token": "…",
  "fw_version": "7.0.0",
  "hw_rev": "v3"
}
```

Antworten:
- `200` `{ "device_token": "…", "config": { … } }` (config siehe Abschnitt 8, optional)
- `400` ungültige Anfrage, `410` Claim-Token abgelaufen oder verbraucht

Regeln (Entscheidung liegt beim Backend, Vorschlag):
- Gerät hat keinen Besitzer: dem Nutzer des Claim-Tokens zuordnen.
- Gerät gehört bereits demselben Nutzer (z. B. nur neues WLAN): Zuordnung bleibt.
- Gerät gehört einem anderen Nutzer: physischer Besitz zählt, auf neuen Nutzer übertragen, alten Nutzer benachrichtigen.
- Bei jedem erfolgreichen Claim ein **neues** `device_token` ausstellen, das alte wird ungültig.

### BLE-Seite (für die App)

- Mechanismus: ESP-IDF Provisioning über BLE (Espressif Protokoll, kompatibel mit der App "ESP BLE Provisioning" und den Espressif Provisioning Libraries für Android/iOS).
- BLE-Name: `CALLGREEN-XXXXXX` (gleiche 6 Hex-Zeichen wie die device_id).
- Security: Security 1 mit Proof of Possession (PoP). Der PoP ist für alle Geräte gleich. Entscheidung: Er liegt in der App als Build-Variable (`.env` bzw. EAS, nicht eingecheckt). Er ist damit aus einem App-Build auslesbar und schützt nur gegen Zufallszugriffe. Die eigentliche Absicherung sind der Claim-Token und das kleine BLE-Fenster (nur bei USB und ohne WLAN oder ohne Zuordnung).
- Empfohlene Library: `@orbital-systems/react-native-esp-idf-provisioning` (Security 1 mit PoP, `sendData` für Custom Endpoints). Erster Test auf echter Hardware: Security 1.
- Reihenfolge in einer BLE-Session:
  1. Custom Endpoint `claim`: App sendet `{ "claim_token": "…" }`, Gerät antwortet `{ "ok": true }`.
  2. Optional WLAN-Scan über das Gerät.
  3. WLAN-Daten senden. Fehler beim WLAN-Connect meldet das Espressif-Protokoll selbst (`AUTH_ERROR`, `NETWORK_NOT_FOUND`). Ein eigenes Fehlerfeld im NVS ist dafür nicht nötig.
  4. Custom Endpoint `status`: Die BLE-Session bleibt nach erfolgreicher WLAN-Verbindung noch 60 s offen. Die App fragt `status` ab (Request-Inhalt `{}`, die Firmware ignoriert ihn). Antwort:
     `{ "wifi": "connected", "claim": "pending" | "ok" | "failed", "http": 0 | 200 | 400 | 410 | … }`
     So erfährt die App direkt, ob `POST /device/claim` geklappt hat, ohne nur auf Backend-Polling angewiesen zu sein. Backend-Polling bleibt als Rückfallebene, falls die BLE-Verbindung vorher abreißt.
- Der Claim beim Backend passiert erst nach erfolgreicher WLAN-Verbindung.

## 5. Messdaten: POST /readings/batch

Ein Request pro Messzyklus. Enthält die aktuelle Messung und gegebenenfalls gepufferte ältere Messungen (max. 24).

Request:
```json
{
  "device_id": "cg-A1B2C3",
  "fw_version": "7.0.0",
  "readings": [
    {
      "seq": 1043,
      "measured_at": 1760346000,
      "time_synced": true,
      "moisture_pct": 47,
      "moisture_raw": 1680,
      "moisture_raw_min": 1672,
      "moisture_raw_max": 1691,
      "temperature_c": 21.4,
      "humidity_pct": 48.2,
      "lux": 312,
      "battery_v": 4.08,
      "charging": false,
      "usb": false
    }
  ],
  "status": {
    "boot_count": 212,
    "wake_cause": "timer",
    "wifi_connect_ms": 1850,
    "rssi": -61,
    "error_flags": 0,
    "buffered_count": 0,
    "next_contact_at": 1760349600
  }
}
```

Felder:
- `seq`: fortlaufende Nummer pro Gerät. **Idempotenzschlüssel ist `(device_id, seq)`**: dieselbe Messung kann bei Wiederholungen mehrfach ankommen und darf nur einmal gespeichert werden.
- `measured_at`: Unix-Sekunden UTC. Bei `time_synced: false` ist die Zeit ungenau (Gerät hatte keinen SNTP-Sync, Abweichung bis zu einigen Minuten pro Stunde Schlaf möglich).
- `temperature_c`, `humidity_pct`, `lux`: `null`, wenn der Sensor ausgefallen ist.
- `moisture_raw_min/max`: Streuung innerhalb der Messung, als Qualitätsindikator.
- `wake_cause`: `timer`, `usb`, `cold_boot`, `command`.
- `error_flags`: Bitmaske (0x01 WLAN, 0x02 Zeit, 0x04 AHT20, 0x08 BH1750, 0x10 Senden, 0x40 Kaltstart, 0x80 Schlafberechnung).
- `next_contact_at`: wann das Gerät sich planmäßig wieder meldet. Grundlage für die Offline-Erkennung.

Antwort `200`:
```json
{
  "accepted_seqs": [1043],
  "config": { },
  "commands_pending": false,
  "ota": null
}
```
- `accepted_seqs`: alle gespeicherten oder bereits vorhandenen seqs. Was hier nicht steht, sendet das Gerät beim nächsten Mal erneut.
- `config`: optional, siehe Abschnitt 8.
- `commands_pending`: true, wenn Befehle vorliegen. Das Gerät holt sie dann sofort ab (auch im Akkubetrieb).
- `ota`: optional, siehe Abschnitt 7. Spart einen separaten Request.

## 6. Befehle an das Gerät

Im Online-Modus (USB plus WLAN) fragt das Gerät alle 10 s, im Akkubetrieb nur wenn `commands_pending: true`.

### GET /device/commands
Antwort:
```json
{ "commands": [ { "id": "c_123", "type": "measure_now", "params": {} } ] }
```

Typen:
| type | params | Wirkung |
|---|---|---|
| `measure_now` | keine | sofort messen und senden (für Dev-Modus und "Jetzt aktualisieren" in der App) |
| `set_wifi` | `{ "ssid": "…", "password": "…" }` | neues WLAN testen. Klappt es, übernehmen, sonst beim alten bleiben |
| `unclaim` | keine | Token löschen, Zustand NICHT ZUGEORDNET (Gerät entfernen, Nutzerwechsel) |
| `factory_reset` | keine | Token und WLAN löschen, Zustand NEU |
| `ota_now` | keine | sofort nach Update suchen |
| `set_config` | wie Abschnitt 8 | Konfiguration übernehmen |

### POST /device/commands/ack
```json
{ "id": "c_123", "result": "ok", "detail": "" }
```
`result`: `ok` oder `failed`. Bei `set_wifi` mit Fehler enthält `detail` z. B. `auth_failed` oder `not_found`.

Hinweis: `set_wifi` funktioniert nur, solange das Gerät noch im alten WLAN online ist (Router-Umzug mit Vorlauf). Ist das alte WLAN schon weg, bleibt nur USB plus BLE.

## 7. OTA: GET /firmware/latest

Query: `?hw_rev=v3&fw_version=7.0.0&device_id=cg-A1B2C3`

Antworten:
- `204` kein Update
- `200`:
```json
{ "version": "7.0.1", "url": "https://…/callgreen_fw_7.0.1.bin", "sha256": "…", "size": 1084352 }
```

Das Gerät fragt einmal täglich, im Online-Modus zusätzlich beim Start des Modus und bei `ota_now`. Es lädt per HTTPS, prüft sha256 und startet neu. Startet die neue Firmware nicht sauber und meldet sich nicht beim Backend, rollt das Gerät automatisch zurück. Backend kann die gemeldete `fw_version` nach dem Update prüfen. Gestaffeltes Ausrollen ist über die `device_id` im Query möglich.

## 8. Konfiguration

Optional in Antworten von `/device/claim`, `/readings/batch` oder per `set_config`. Fehlende Felder bedeuten: Standardwert der Firmware behalten.

```json
{
  "settle_ms": 2000,
  "samples": 20,
  "low_battery_v": 3.4,
  "critical_battery_v": 3.2,
  "online_poll_s": 10
}
```

Der Messplan (wann gemessen wird) bleibt vorerst in der Firmware: 0 bis 5 Uhr Pause, 5 bis 13 Uhr stündlich, 13 bis 20 Uhr halbstündlich, 20 bis 24 Uhr Pause (lokale Zeit Europe/Berlin).

## 9. Was das Backend selbst erkennen sollte

- **Offline:** Ist `next_contact_at` um mehr als 2 Stunden überschritten, Nutzer informieren: "Dein Sensor meldet sich nicht. Steck ihn kurz per USB an, um das WLAN neu einzurichten."
- **Akku:** `battery_v` unter 3,5 V: Hinweis "Bitte bald laden". Unter 3,3 V: dringend. Unter 3,2 V sendet das Gerät nicht mehr bis zum Laden.
- **Sensorfehler:** `temperature_c` oder `lux` wiederholt `null`, oder große Spanne `moisture_raw_max - moisture_raw_min`: intern markieren.
- **Zeit:** Bei `time_synced: false` Messung annehmen, aber nicht für zeitkritische Auswertungen nutzen.

## 10. Fehlerverhalten der Firmware

- HTTP 200: ok. 401: Token ungültig, Zustand NICHT ZUGEORDNET. 4xx sonst: Messung wird verworfen (nicht endlos wiederholen) und im nächsten Status als Fehler gemeldet. 5xx oder Netzwerkfehler: Messung bleibt im Puffer.
- Timeouts: 15 s pro Request.
- Puffer: max. 24 Messungen im RTC-Speicher. Bei Überlauf fallen die ältesten weg. Bei Stromverlust (Zelle ab) geht der Puffer verloren.

## 11. Ablösung der bisherigen Convex-Funktionen (Empfehlung der Firmware-Seite)

- `claimSensor` (App schickt `device_id`): entfällt. Die `device_id` ist aus der MAC ableitbar und nicht geheim. Wer sie kennt, könnte fremde Geräte übernehmen.
- `registerSensor`: wird durch `POST /device/claim` ersetzt. Ein Gerät existiert im Backend erst nach dem ersten erfolgreichen Claim.
- `createClaimToken` (neue Mutation, Clerk-authentifiziert): liefert der App den Claim-Token vor dem BLE-Flow.
- `isDeviceOnline`: bleibt bestehen. Polling-Ziel der App beim Onboarding ist aber `getClaimStatus` (Status des eigenen Claim-Tokens), weil `isDeviceOnline` bei einem bereits bekannten Sensor sofort "gefunden" meldet. Bestätigt durch die Firmware-Seite.
- Die App leitet die `device_id` aus dem BLE-Namen ab (`CALLGREEN-XXXXXX` ergibt `cg-XXXXXX`). Bestätigt.
- `/readings` und `/logs`: bleiben, bis kein Gerät mehr v6 nutzt.

## 12. Umsetzungsstand (13.10.2026)

| Teil | Backend | App | Firmware |
|---|---|---|---|
| Claim, Claim-Token, Besitzerregeln | umgesetzt (`convex/devices.ts`, Tabelle `claim_tokens`) | umgesetzt (BLE-Flow mit orbital-systems Library) | Phase A in Arbeit |
| `/readings/batch` | offen | nicht betroffen | Phase B |
| Bearer-Prüfung mit 401 | offen | nicht betroffen | Phase A/B |
| Befehle | offen | offen | Phase C |
| OTA | offen | nicht betroffen | Phase D |

Noch nichts davon ist auf echter Hardware getestet.

## 13. Bitte zurückmelden an die Firmware-Seite

- Endgültige Base-URL und Pfade, falls abweichend
- Host und Zertifikatskette für OTA-Dateien
- Ob Abweichungen am JSON nötig sind (Feldnamen, Einheiten)
