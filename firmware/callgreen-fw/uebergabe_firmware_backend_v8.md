# Übergabe an Backend und App: Update nach Hardwaretest Firmware v7, Phase A

Stand: 13.10.2026. Verfasst aus Sicht der Firmware. Ergänzt und präzisiert den Vertrag `Uebergabe_Backend_Firmware_v7.md`. Wo sich beide widersprechen, gilt dieses Dokument. Bitte vor dem nächsten Hardwaretest umsetzen.

## 1. Stand

- Firmware 7.0.0, Phase A (Geräteidentität, Zustände, BLE-Onboarding, Claim) läuft auf echter Hardware.
- Claim über BLE funktioniert: `POST /device/claim` liefert 200 und ein `device_token` mit 43 Zeichen. Testgerät: `cg-00A5D8`.
- Im Test sind zwei Probleme aufgefallen. Beide sind auf Firmware-Seite behoben, erfordern aber Anpassungen in der App (Abschnitt 2).

## 2. App

### 2.1 Proof of Possession (PoP)

- Der neue Wert in `EXPO_PUBLIC_ESP_POP` enthält nur Buchstaben und Ziffern, 16 Zeichen.
- Der alte Wert enthielt `$`. Expo ersetzt in `.env`-Dateien `$NAME` durch Variablen, dadurch kam beim Gerät ein anderer PoP an. Folge: „Key mismatch“, Verbindungsabbruch.
- `EXPO_PUBLIC_*` wird beim Bündeln fest eingebaut. Für den neuen Wert ist ein neuer JS-Build nötig (`eas update` oder `eas build`).
- Kontrolle: Länge in der App kurz loggen (muss 16 sein). Den Wert selbst nicht loggen.

### 2.2 BLE-Ablauf (verbindlich)

1. Verbinden mit `CALLGREEN-XXXXXX`, Security 1 mit PoP. Die device_id ist `cg-XXXXXX` (gleiche 6 Zeichen).
2. Custom Endpoint `claim` mit `{ "claim_token": "…" }`.
   - Antwort `{ "ok": true }`: Token angenommen.
   - Antwort `{ "ok": false, "error": "invalid_token" }`: Format ungültig (erwartet Base32, max. 64 Zeichen).
   - Antwort `{ "ok": false, "error": "already_claimed" }`: In dieser Session war bereits ein Claim erfolgreich. Die App fragt dann `status` ab (Schritt 4).
3. WLAN-Daten senden. Fehler meldet das Espressif-Protokoll (`AUTH_ERROR`, `NETWORK_NOT_FOUND`). Danach dürfen neue WLAN-Daten gesendet werden.
   - **Optional (Stand 14.10.2026):** Meldet `status` bereits `wifi: "connected"` und `claim: "ok"`, darf die App diesen Schritt auslassen und trennen. Das ist der Fall, wenn das Gerät schon mit seinem gespeicherten WLAN verbunden war und den Claim darüber ausgeführt hat.
   - Will der Nutzer trotzdem ein anderes WLAN, schickt die App die WLAN-Daten wie gewohnt (siehe 2.3).
4. Custom Endpoint `status` (Inhalt `{}`) etwa jede Sekunde abfragen, bis `claim` auf `ok` oder `failed` steht. Erst danach trennen.
   - Antwort: `{ "wifi": "connected" | "disconnected", "claim": "pending" | "ok" | "failed", "http": 0 | 200 | 400 | 410 | …, "ssid": "…" }`
   - `ssid` (optional, ab 14.10.2026): Name des verbundenen WLANs. Fehlt, wenn `wifi` nicht `connected` ist. Die App kann es anzeigen, muss es aber nicht auswerten.
   - Der Claim dauert nach der WLAN-Verbindung im Test 4 bis 12 s. Mindestens 30 s abfragen.

Ist das gespeicherte WLAN schon verbunden (Gerät war bereits eingerichtet), führt das Gerät den Claim direkt nach Schritt 2 aus.

### 2.3 Geändertes Verhalten nach dem Claim

- **Nachlauf (Stand 14.10.2026):** Direkt nach `claim: ok` hält das Gerät BLE höchstens 60 s offen, **und nur so lange, wie die App verbunden bleibt**. Trennt die App, beendet das Gerät BLE sofort und wirbt nicht erneut. Es wartet nicht mehr auf WLAN-Daten (die frühere Wartezeit von 5 min entfällt).
- Schickt die App im Nachlauf WLAN-Daten, pausiert der Nachlauf bis zum Ergebnis (höchstens 30 s):
  - Erfolg: wieder 60 s offen für `status`, Ende bei Trennung.
  - Fehler: Das Gerät stellt das zuletzt funktionierende WLAN wieder her. BLE bleibt offen, solange die App verbunden ist, ohne 60-s-Grenze. Die App kann neue WLAN-Daten senden.
- Grund: Im Test war nach dem Trennen ein zweites Onboarding möglich. Das stellte ein zweites `device_token` aus und entwertete das erste.
- Pro BLE-Session ist genau ein erfolgreicher Claim möglich.
- Bei `claim: failed` (z. B. `http: 410`, Token abgelaufen) darf die App in derselben Session einen neuen `claim_token` an `claim` schicken. Das Gerät nimmt ihn an (`{ "ok": true }`), setzt `status` auf `claim: "pending"`, `http: 0` und führt den Claim erneut aus. `already_claimed` kommt nur nach einem **erfolgreichen** Claim, nie nach `failed`.
- Während ein Claim läuft, steht `status` auf `pending`. Einen neuen `claim_token` erst schicken, wenn `status` `failed` meldet. Kommt trotzdem einer während des laufenden Claims an: Endet der laufende Claim mit `ok`, wird der neue verworfen. Endet er mit `failed`, wird der neue als Nächstes verwendet.
- Vor dem Claim-Erfolg gilt das nicht: Nach einem WLAN-Fehler ohne erfolgreichen Claim wirbt das Gerät nach dem Trennen weiter (siehe Abschnitt 4, Frage 2).

### 2.4 Wann das Gerät per BLE sichtbar ist

| Situation | BLE |
|---|---|
| USB gesteckt, Zustand NEU oder NICHT ZUGEORDNET | ja, solange USB steckt |
| USB gesteckt, AKTIV, gespeichertes WLAN nicht erreichbar | ja, solange USB steckt (parallel weitere WLAN-Versuche) |
| USB gesteckt, AKTIV, WLAN verbunden | nein |
| Zelle neu eingesetzt, Zustand NEU, ohne USB | 10 min |
| Akkubetrieb sonst | nein |

Ein zugeordneter Sensor mit funktionierendem WLAN lässt sich nicht per BLE neu einrichten. Das geht erst über den Befehl `unclaim` (Phase C) oder wenn das WLAN nicht erreichbar ist. Bitte in der App entsprechend erklären.

### 2.5 Erfolgsmeldung in der App

Polling-Ziel beim Onboarding bleibt `getClaimStatus`. Der BLE-Endpoint `status` kommt zusätzlich dazu und liefert das Ergebnis schneller.

## 3. Backend

### 3.1 v6-Endpoints während Phase A

Bis `/readings/batch` bereitsteht, sendet die Firmware weiter an `/readings` (18 Einzel-POSTs pro Zyklus) und `/logs`. Zwei Änderungen gegenüber v6:

- `sensor_id` ist jetzt die device_id (z. B. `cg-00A5D8`), nicht mehr `planty-proto-01`. Bitte auf beiden Endpoints akzeptieren und dem zugeordneten Nutzer zuordnen.
- Jeder Request trägt jetzt `Authorization: Bearer <device_token>`.

Gemessen wird nur im Zustand AKTIV.

### 3.2 401 nur bei ungültigem Token

Auf **jedes** 401 löscht das Gerät sein `device_token`, leert seinen RTC-Puffer (siehe 5.7), wechselt in NICHT ZUGEORDNET und sendet nichts mehr bis zum nächsten Onboarding per USB. Deshalb:

- 401 nur, wenn das `device_token` ungültig oder durch einen neueren Claim ersetzt ist.
- Kein 401 bei fehlendem Header auf Endpoints, die noch ohne Auth laufen.
- Kein 401 bei anderen Fehlern, dafür 400 oder 403 verwenden.
- Falls die Bearer-Prüfung auf `/readings` und `/logs` eingeführt wird, muss sie das aktuelle Token korrekt akzeptieren.

### 3.3 Claim

- Funktioniert wie im Vertrag v7 spezifiziert.
- Im Test wurde `cg-00A5D8` zweimal kurz nacheinander durch denselben Nutzer geclaimt (zwei Tokens, gültig ist das letzte). Das ist auf Firmware-Seite jetzt verhindert. Bitte prüfen, dass das Gerät nur einmal und dem richtigen Nutzer zugeordnet ist.
- `config` in der Claim-Antwort bleibt optional und wird ab Phase B übernommen.
- Timeout auf Geräteseite: 15 s pro Request.

### 3.4 Nächster Schritt

Bitte melden, sobald `POST /readings/batch` laut Vertrag v7 Abschnitt 5 und 10 bereitsteht:

- `accepted_seqs` in der Antwort
- Idempotenz über `(device_id, seq)`
- Bearer-Prüfung mit 401 laut Abschnitt 3.2

Erst dann startet Firmware Phase B. Ab Phase B nutzt die Firmware `/readings` und `/logs` nicht mehr.

## 4. Antworten auf die Rückfrage der App (13.10.2026)

### Frage 1: Zweiter Security-1-Handshake auf derselben BLE-Verbindung

**Wird akzeptiert.** Kommt auf einer bestehenden Verbindung ein neuer Session-Aufbau (SessionCmd0), verwirft das Gerät die alte Session und baut eine neue auf. Die BLE-Verbindung bleibt dabei bestehen, die Firmware trennt nicht. Grundlage ist der Code von ESP-IDF v6.1 (`protocomm/security1.c`). Auf der Konsole erscheint dann `Invalid state of session … Restarting session` als Warnung, das ist erwartet.

Hinweise:
- Ab dem neuen Handshake gilt nur noch der neue Session-Schlüssel. Alle weiteren Aufrufe (`status`, `claim`) müssen über die neue Session laufen.
- Der 2,5-s-Abbruch aus dem ersten Test ging nicht vom Gerät aus. Das Gerät hat zu diesem Zeitpunkt nicht getrennt, sondern nach der Trennung wieder geworben. Die Trennung kam also von Telefon oder App.
- Auf echter Hardware ist der zweite Handshake noch nicht getestet. Die Konsole zeigt im nächsten Test, ob er stattfindet.

### Frage 2: Advertising nach WLAN-Fehler

**Nach einem WLAN-Fehler wirbt das Gerät weiter.** „Kein erneutes Advertising nach Trennung“ gilt nur, wenn Claim **und** WLAN über BLE erfolgreich waren. Nach `AUTH_ERROR` oder `NETWORK_NOT_FOUND` gilt:

- Das Gerät bleibt im Onboarding, solange USB steckt, und nimmt neue WLAN-Daten an.
- Beide Wege funktionieren: neue WLAN-Daten auf derselben Verbindung senden, oder trennen, neu verbinden und neu senden.
- War der Claim in dieser Session schon erfolgreich, kommt `{ "ok": false, "error": "already_claimed" }`, falls die App `claim` erneut aufruft. Seit 14.10.2026 gilt nach `claim: ok` der Nachlauf aus 2.3: Trennt die App, endet BLE sofort. Ein Wiederverbinden nach einem erfolgreichen Claim ist also nicht mehr möglich. Ein WLAN-Fehler danach wird auf derselben Verbindung behandelt.

Im Zuge dieser Prüfung auf Firmware-Seite behoben: Ein WLAN-Fehler über BLE hat bisher die vorher gespeicherten WLAN-Daten des Geräts gelöscht (Verhalten der Espressif-Komponente). Jetzt stellt das Gerät die bisherigen WLAN-Daten wieder her und versucht sie parallel weiter. Ein Tippfehler beim Passwort kostet also nicht mehr das funktionierende WLAN.

### 4.3 Befehle (Phase C, 14.10.2026)

Ergänzt Vertrag v7 §6. Mit dem Backend abgestimmt.

**Ack:** `POST /device/commands/ack` mit `{ "id": "…", "result": "ok" | "failed", "detail": "…" }`. Bei `ok` ist `detail` leer.

**`detail`-Werte bei `failed`** (das Backend kann sie an die App weitergeben):

| `detail` | Befehl | Bedeutung |
|---|---|---|
| `auth_failed` | `set_wifi` | Passwort falsch. Das bisherige WLAN bleibt. |
| `not_found` | `set_wifi` | Netz nicht gefunden. Das bisherige WLAN bleibt. |
| `timeout` | `set_wifi` | Keine Verbindung oder keine IP innerhalb von 15 s. Das bisherige WLAN bleibt. |
| `no_backend` | `set_wifi`, `measure_now` | `set_wifi`: verbunden, aber das Backend war über das neue WLAN nicht erreichbar; das bisherige WLAN bleibt. `measure_now`: gemessen, aber `/readings/batch` nicht mit 200 bestätigt; die Messung bleibt im Puffer. |
| `invalid_params` | `set_wifi`, `set_config`, alle | `set_wifi`: SSID nicht 1–32 Byte oder Passwort nicht 0, 8–63 oder 64 Hex-Zeichen. `set_config`: kein einziges gültiges Feld (Bereiche siehe 5.5). Allgemein: `type` fehlt. |
| `unsupported` | unbekannter Typ, `unclaim` | Typ wird nicht unterstützt. `unclaim` entfällt, das Backend entwertet stattdessen das Token (401). |
| `not_supported` | `ota_now` | Nur Firmware vor Phase D. Ab Phase D entfällt der Wert, es gelten die `ota_now`-Werte aus 6.3. |

**Regeln auf Geräteseite:**
- `id`: `c_` plus Convex-ID, höchstens 48 Zeichen, Zeichen `A–Z a–z 0–9 _ -`. Befehle mit ungültiger `id` werden übersprungen und nicht quittiert.
- Höchstens 10 Befehle pro Abfrage, der Reihe nach.
- **Idempotent über die `id`:** Die letzten 8 ausgeführten ids mit Ergebnis liegen im NVS. Kommt eine id erneut, führt das Gerät den Befehl nicht noch einmal aus und schickt nur das gespeicherte Ack. Das Backend nimmt doppelte Acks ohne Fehler an.
- **`measure_now`:** sofort messen und `/readings/batch` senden (`wake_cause: "command"`), danach Ack. Der Messplan verschiebt sich nicht.
- **`set_config`:** wie `config` in 5.5. `ok`, wenn mindestens ein Feld gültig war. Ungültige Felder werden ignoriert.
- **`set_wifi`:** Die neuen Daten werden nur im RAM gesetzt und mit 15 s Timeout getestet. Erfolg heißt: IP **und** Ack 200 über das neue WLAN. Erst dann speichert das Gerät die Daten im NVS. Bei Fehler stellt es das bisherige WLAN wieder her und sendet `failed` mit `detail` über das bisherige WLAN. Ist auch das bisherige WLAN nicht erreichbar, folgt das Ack beim nächsten Kontakt. SSID und Passwort erscheinen in keinem Log.
- **`factory_reset`:** erst Ack `ok`, nach 200 löschen: `device_token`, WLAN-Daten, RTC-Puffer. Der `seq`-Zähler und `config` bleiben. Danach Neustart als NEU. Kommt das Ack nicht an, führt das Gerät den Befehl nicht aus; er bleibt offen. Das Backend entwertet das Token beim Ack.
- Ein 401 bei der Abfrage oder beim Ack wird wie in 3.2 behandelt.

**Wann abgefragt wird:**
- **Online-Modus** (USB, AKTIV, WLAN verbunden): `GET /device/commands` beim Start des Modus und danach alle `online_poll_s` (Standard 10 s), über eine bestehende Keep-Alive-Verbindung. Die Messung läuft weiter nach Plan. Der Online-Modus ersetzt den Lademodus aus v6.
  - USB abgezogen: Deep Sleep bis zum nächsten Slot.
  - WLAN länger als 2 min weg: BLE-Onboarding mit parallelen WLAN-Versuchen (Vertrag v7 §2).
- **Akkubetrieb:** nur wenn `/readings/batch` mit `commands_pending: true` antwortet. Dann sofort abholen, ausführen, quittieren und danach schlafen.
- **Bekannte Abweichung:** Im Online-Modus bleibt das WLAN während der Messung an. Vertrag v7 sieht Messen mit WLAN aus vor. Mit USB ist der Strom unkritisch. Ob das WLAN den ADC-Wert merklich stört, ist nicht gemessen [unklar].

## 5. Präzisierungen Phase B (14.10.2026)

Ergänzen Vertrag v7 Abschnitt 5. Mit dem Backend abgestimmt.

### 5.1 `time_synced` und `measured_at`

- Das Gerät misst bei ausgeschaltetem WLAN und verbindet sich erst danach.
- Gelingt danach ein echter SNTP-Sync, rechnet das Gerät `measured_at` der **aktuellen** Messung auf die synchronisierte Uhr um (Sync-Zeit minus verstrichene Zeit seit der Messung) und setzt `time_synced: true`.
- Gepufferte Messungen aus Zyklen ohne SNTP-Sync (WLAN-Ausfall, Backoff, Akkuschutz) behalten ihren Zeitstempel der weiterlaufenden Uhr und senden `time_synced: false`. Sie werden auch später nicht nachkorrigiert.
- Hatte das Gerät seit dem Einsetzen der Zelle nie einen Sync, kann `measured_at` bei `time_synced: false` nahe 0 (1970) liegen.

### 5.2 `buffered_count`

- `buffered_count` ist die Zahl der **älteren** Messungen im selben Batch, ohne die aktuelle.
- Beispiel: Batch mit 3 Messungen ergibt `buffered_count: 2`.

### 5.3 `seq`

- `seq` steigt pro Gerät streng monoton. Das Gerät reserviert Nummern im NVS in Blöcken zu 100. Nach einem Stromverlust geht es beim nächsten Block weiter. **Lücken sind möglich, Wiederholungen nicht.**
- Startwert: Liegt im NVS noch kein Zähler (neues Gerät oder NVS komplett gelöscht, z. B. beim Entwickeln), startet `seq` bei einem Zufallswert zwischen 1 und 16 777 216. Danach zählt es fortlaufend weiter.
  - Grund: Nach einem Löschen würde ein Neustart bei 1 alte `(device_id, seq)` wiederverwenden. Das Backend würde neue Messungen dann als Duplikate behandeln und still verwerfen.
  - Folge für das Backend: `seq` ist nur innerhalb einer Zählerreihe fortlaufend. Nach einem kompletten NVS-Löschen kann eine neue Reihe mit **kleinerem** Wert beginnen. Bitte nirgends annehmen, dass `seq` über die gesamte Lebensdauer eines Geräts nur steigt. Für Reihenfolge und Zeit `measured_at` verwenden, `seq` nur für die Idempotenz.
- `factory_reset` (Phase C) löscht `device_token` und WLAN-Daten, **nicht** den `seq`-Zähler (wie v7 §6). Die device_id bleibt gleich, also müssen auch die seqs eindeutig bleiben. Den Zähler setzt nur ein komplettes Löschen des Flash zurück (Entwicklung, Werksprogrammierung).
- Wird der Zähler neu gesetzt und liegen noch Messungen im RTC-Puffer, verwirft das Gerät diese gepufferten Messungen. Ein Batch enthält damit nie seqs aus einer alten und einer neuen Reihe.
- Restrisiko: Landet ein neuer Zufallsstart in einem früher benutzten Bereich desselben Geräts, bestätigt das Backend neue Messungen als Wiederholung, ohne sie zu speichern. Das betrifft nur Geräte, deren Flash komplett gelöscht wurde.

### 5.4 `moisture_pct` kann `null` sein

- Das Backend akzeptiert `moisture_pct: null` (Messung wird gespeichert, nicht ausgewertet, kein 400).
- Normalfall: `moisture_pct` als Zahl von 0 bis 100, dazu `moisture_raw`, `moisture_raw_min`, `moisture_raw_max`.
- Kann der ADC keinen einzigen Wert lesen (in der Praxis nicht beobachtet), sendet die Firmware `moisture_pct: null` und lässt die drei Rohwert-Felder weg.
- Eine Plausibilitätsprüfung auf dem Gerät gibt es nicht. Ein lesbarer, aber unplausibler Rohwert (z. B. Sensor abgesteckt) wird normal gesendet. Rohwert, Min und Max gehen immer mit, die Bewertung macht das Backend.
- Hinweis zu §10: Lehnt das Backend einen Batch mit 400 ab, verwirft das Gerät den ganzen Puffer, weil es nicht weiß, welche Messung das Problem war. Ein 400 sollte deshalb nur bei wirklich unbrauchbaren Anfragen kommen. Unplausible Einzelwerte bitte annehmen und intern markieren.

### 5.5 `config`: Wertebereiche

Gemeinsam festgelegt, Firmware (`config.c`) und Backend prüfen identisch:

| Feld | Bereich | Standard der Firmware |
|---|---|---|
| `settle_ms` | 50 bis 30000 | 2000 |
| `samples` | 1 bis 200 | 20 |
| `low_battery_v` | 3,0 bis 4,2 | 3,4 |
| `critical_battery_v` | 2,8 bis 4,0, und kleiner als `low_battery_v` | 3,2 |
| `online_poll_s` | 2 bis 3600 | 10 |

Regeln auf Geräteseite:
- Ein fehlendes Feld lässt den zuletzt im NVS gespeicherten Wert unverändert. Es gibt kein Rücksetzen auf den Standard. `config: {}` ändert nichts.
- Ein Feld außerhalb des Bereichs oder mit falschem Typ wird ignoriert, die übrigen Felder werden übernommen.
- `low_battery_v` und `critical_battery_v` werden gemeinsam geprüft. Ist nach dem Übernehmen `critical_battery_v` nicht kleiner als `low_battery_v`, ignoriert das Gerät beide.
- Gespeichert wird nur bei einer Änderung (schont den Flash).

Testwert für den Akkuschutz: `critical_battery_v: 4.0` mit `low_battery_v: 4.2`. Der Test greift nur, wenn die Zelle unter 4,0 V liegt. Frisch geladen hat sie 4,1 bis 4,2 V. Vor dem Test daher im Log bei `bat=` prüfen und das Gerät gegebenenfalls einige Stunden im Akkubetrieb laufen lassen.

### 5.6 Einschwingzeit

- `settle_ms` = 2000 ist der Standardwert aus Vertrag v7 §8. Er ist **noch nicht gemessen**.
- Der Settle-Test, der die 60 s aus v6 ablösen soll, ist bisher nicht gelaufen. Er steht als nächster Hardwaretest an. Bis dahin ist 2000 ms ein vorläufiger Wert. Das Ergebnis wird per `config` gesetzt, ohne neue Firmware.

### 5.7 Puffer bei 401 (ersetzt v7 §10 für diesen Fall)

- v7 §10 sah vor, dass Messungen bei 401 im Puffer bleiben. Mit dem Backend abgestimmt gilt jetzt: Bei **jedem** 401 löscht das Gerät das `device_token`, leert den RTC-Puffer und wechselt in NICHT ZUGEORDNET.
- Grund: Das Backend entfernt Sensoren, indem es das Token entwertet. Würde das Gerät den Puffer behalten, gingen Messungen des alten Besitzers nach einem neuen Claim an den neuen Besitzer.
- Folge: Nach einem 401 sind bis zu 24 noch nicht bestätigte Messungen verloren.

## 6. Phase D: OTA (umgesetzt, Stand 14.10.2026)

Mit dem Backend abgestimmt. Firmware gebaut, Hardwaretest offen. Image mit `-Os`: 1,30 MiB, 33 % des Slots frei.

### 6.1 Flash-Layout und Ablauf der Beta-Flashes

- **Die OTA-fähige Partitionstabelle und der Bootloader mit Rollback müssen schon beim ersten Flash eines Geräts drauf sein.** Beides lässt sich per OTA nicht nachrüsten, nur per USB. Jedes Beta-Gerät wird deshalb einmal per USB mit einer Firmware ab Phase D geflasht (`idf.py -p <PORT> flash` schreibt Bootloader, Partitionstabelle, `otadata` und App). Danach laufen alle Updates per OTA.
- Geräte, die vorher mit Phase A bis C geflasht wurden, brauchen diesen einen USB-Flash ebenfalls.
- Partitionstabelle ab Phase D (4 MB Flash):

| Name | Typ | Offset | Größe | Änderung |
|---|---|---|---|---|
| nvs | data/nvs | 0x9000 | 0x6000 | unverändert |
| otadata | data/ota | 0xF000 | 0x2000 | unverändert |
| phy_init | data/phy | 0x11000 | 0x1000 | unverändert |
| ota_0 | app/ota_0 | 0x20000 | 0x1F0000 | bisher 0x1E0000 |
| ota_1 | app/ota_1 | 0x210000 | 0x1F0000 | bisher 0x200000 / 0x1E0000 |

- **NVS bleibt an Offset 0x9000 mit gleicher Größe.** `device_token`, WLAN-Daten, `seq`-Zähler, `config` und die Befehlsliste bleiben beim Umflashen erhalten. Ein Gerät muss danach nicht neu eingerichtet werden.
- Die Slots wachsen um je 64 KB auf 1,94 MiB. Sie nutzen die bisher freien 128 KB am Ende des Flash.
- Der Build wechselt auf Größenoptimierung (`-Os`), damit bleibt mehr Reserve für künftige Images.

### 6.2 Ablauf eines Updates (Geräteseite)

- **Angebot:** `ota` aus dem Batch, schon vom Backend nach `device_id` und Rollout gefiltert. Dazu `GET /firmware/latest` bei `ota_now` und beim Start des Online-Modus. 204 oder `ota: null` bedeutet kein Update. Beide Endpoints und der Download laufen **ohne** Bearer-Token.
- **Prüfungen vor dem Download:**
  - Version ungleich der laufenden.
  - Version nicht gesperrt (zurückgerollt).
  - URL beginnt mit `https://` und hat höchstens 256 Zeichen.
  - `size` passt in den Slot.
  - Akku: mit USB immer, im Akkubetrieb nur bei `battery_v` ≥ `low_battery_v` + 0,2 V.
- **Download und Prüfung:**
  - Download mit `esp_https_ota` über die Zertifikatskette von `*.convex.site`.
  - Projektname `callgreen_fw` und Version im Image müssen zum Angebot passen.
  - Danach liest das Gerät den geschriebenen Bereich zurück und prüft `sha256` über die komplette `.bin` gegen das Angebot.
  - Erst dann wird die neue Version als Boot-Partition gesetzt, gefolgt vom Neustart.
- **Gültigkeit:** Die neue Version startet als „zu prüfen“. Gültig wird sie erst bei der ersten Antwort 200 von `/readings/batch` oder `/device/commands`. Startet das Gerät vorher neu, rollt der Bootloader auf die vorherige Version zurück. Dazu zählen ein Absturz, ein Watchdog-Reset, ein Stromverlust und auch das Aufwachen aus dem Deep Sleep ohne Backend-Kontakt.
- **Nach einem Rollback** sperrt das Gerät die verworfene Version im NVS und meldet sie im nächsten Batch unter `status.ota_rollback_version`. Automatisch angeboten wird die gesperrte Version nicht erneut installiert. `ota_now` versucht sie trotzdem.
- **Fehlversuche:** Nach 3 gescheiterten Downloads derselben Version pausiert das Gerät sie 24 h.
- **Stromverlust während des Downloads:** Die laufende Version bleibt unberührt. Das Gerät startet die alte Version, und der nächste Versuch beginnt von vorn.
- **Versionsnummer:** einzige Quelle ist `PROJECT_VER` im Build. `fw_version` in allen Requests ist identisch mit der Version im Image.

### 6.3 `detail`-Werte im Ack von `ota_now`

Für App-Texte. Ein automatisches Update aus dem Batch-Angebot sendet kein Ack, das Ergebnis zeigt sich an `fw_version` oder `ota_rollback_version`.

| `result` | `detail` | Bedeutung |
|---|---|---|
| `ok` | (leer) | Update geladen, geprüft und installiert. Das Gerät startet neu und meldet danach die neue `fw_version`. |
| `ok` | `no_update` | Kein Update vorhanden (204), oder die angebotene Version läuft bereits. |
| `failed` | `low_battery` | Akkubetrieb und Akku unter `low_battery_v` + 0,2 V. Update später mit USB oder geladenem Akku. |
| `failed` | `download_failed` | Download abgebrochen, Zeitüberschreitung oder Größe stimmt nicht mit `size` überein. Die bisherige Version läuft weiter. |
| `failed` | `sha256_mismatch` | Prüfsumme der geladenen Datei stimmt nicht mit `sha256` überein. Nicht installiert. |
| `failed` | `invalid_image` | Image passt nicht: falscher Projektname, Version im Image ungleich `version`, Angebot unvollständig, oder die Image-Prüfung der IDF schlägt fehl. Nicht installiert. |

Ob ein Update nach dem Neustart wirklich gültig wurde, zeigt erst der nächste Batch: `fw_version` neu, oder bei Rollback `status.ota_rollback_version`.

## 7. Umsetzungsstand

| Teil | Backend | App | Firmware |
|---|---|---|---|
| PoP ohne Sonderzeichen | nicht betroffen | umgesetzt | umgesetzt |
| `claim`-Antwort mit `error` (`invalid_token`, `already_claimed`) | nicht betroffen | offen | umgesetzt |
| Nachlauf direkt nach Claim ok, WLAN-Daten optional (2.2, 2.3) | nicht betroffen | passt zum aktuellen Verhalten | umgesetzt, auf Hardware getestet (14.10.2026) |
| `status` mit optionalem `ssid` | nicht betroffen | wird ignoriert | umgesetzt, Hardwaretest offen |
| WLAN-Daten nach WLAN-Fehler wiederherstellen | nicht betroffen | nicht betroffen | umgesetzt |
| `status` abfragen vor dem Trennen | nicht betroffen | umgesetzt | umgesetzt |
| BLE endet bei Trennung, ein Claim pro Session | nicht betroffen | Hinweis in der App | umgesetzt |
| `sensor_id` = device_id auf v6-Endpoints | offen | nicht betroffen | umgesetzt |
| 401 nur bei ungültigem Token | offen | nicht betroffen | umgesetzt |
| `/readings/batch` | umgesetzt (Dev-Deployment) | nicht betroffen | Phase B gebaut, Hardwaretest offen |
| `config` pro Gerät setzbar | umgesetzt, Bereiche an 5.5 anpassen | nicht betroffen | umgesetzt (5.5) |
| Prüfen: keine Annahme „seq steigt immer“ | geprüft | nicht betroffen | siehe 5.3 |
| `moisture_pct: null` | umgesetzt | nicht betroffen | umgesetzt (5.4) |
| Settle-Test, echte Einschwingzeit | nicht betroffen | nicht betroffen | offen (5.6) |
| `/device/commands`, `/ack` (4.3) | in Arbeit | offen | Phase C gebaut, Hardwaretest offen |
| Puffer leeren bei 401 (5.7) | nicht betroffen | nicht betroffen | umgesetzt, Hardwaretest offen |
| Online-Modus statt Lademodus (4.3) | nicht betroffen | nicht betroffen | umgesetzt, Hardwaretest offen |
| OTA: `/firmware/latest`, Datei-Endpoint, `ota` im Batch (6) | umgesetzt (Dev) | Texte für 6.3 | umgesetzt, Hardwaretest offen |
| `status.ota_rollback_version` (6.2) | in Arbeit | nicht betroffen | umgesetzt, Feld nur vorhanden bis zum nächsten Batch mit 200 |
