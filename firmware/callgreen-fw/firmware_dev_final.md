# Callgreen Firmware: Gesamtstand und Übergabe

Stand: 2026-10-22 · Verfasst von: Firmware-Session (Claude Code)
Wissensstand der Firmware-Session: bis 2026-10-14, 13:47. Zwischen dem 14.10. und dem 22.10. habe ich keine Informationen. Was in dieser Zeit getestet oder geändert wurde, ist hier als [unklar] markiert.

Dieses Dokument fasst alles zusammen, was die Firmware-Session über den Sensor, den Code, die Schnittstellen, Tests und offene Punkte weiß. Es soll ohne den bisherigen Chatverlauf verständlich sein.

Maßgebliche Begleitdokumente im Projektordner:
- `Uebergabe_Backend_Firmware_v7.md`: ursprünglicher Vertrag Firmware ↔ Backend/App (13.10.2026).
- `uebergabe_firmware_backend_v8.md`: Ergänzungen und Präzisierungen nach den Hardwaretests. **Wo v7 und v8 sich widersprechen, gilt v8.**

Secrets stehen in diesem Dokument nicht, nur Variablennamen.

---

## Inhalt

1. Kurzfassung
2. Produkt und Hardware
3. Entwicklungsumgebung und Werkzeuge
4. Projektstruktur und Code
5. Build-Konfiguration und Entscheidungen
6. Verhalten zur Laufzeit
7. Schnittstellen (BLE, HTTP, Datenformate)
8. Test- und Umsetzungsstand
9. Bekannte Probleme, Risiken, Einschränkungen
10. Offene Punkte und nächste Schritte
11. Abhängigkeiten zu anderen Bereichen
12. Erkenntnisse und Stolperfallen
13. Kurzreferenz: Befehle und erwartete Log-Zeilen
14. Verlauf (Chronik)

---

## 1. Kurzfassung

- **Gerät:** Callgreen Pflanzensensor, ESP32-C3-MINI-1-H4X, eigene PCB Rev. v3, Akku 3000 mAh, USB-C zum Laden und Flashen. Kein Taster, keine LED, kein Display.
- **Firmware:** ESP-IDF v6.1, Version `7.0.0`. Gebaut in den Phasen A bis D nach Vertrag v7 und v8.

| Phase | Inhalt | Gebaut | Auf Hardware getestet |
|---|---|---|---|
| A | Geräteidentität, Zustände, BLE-Onboarding, Claim | ja | ja (13.–14.10.) |
| B | Messen mit WLAN aus, RTC-Puffer, `POST /readings/batch`, Backoff, Akkuschutz, `config` | ja | weitgehend (14.10.) |
| C | Befehle (`GET /device/commands`, Ack), Online-Modus bei USB | ja | nein [unklar ab 14.10.] |
| D | OTA mit sha256-Prüfung und Rollback | ja | nein [unklar ab 14.10.] |

- **Was auf dem Testgerät läuft:** Der Build mit Phase D (`build/callgreen_fw.bin`, 0x14DBA0 Byte) wurde am 14.10. um 13:47 geflasht. Das zeigt `build/callgreen_fw_flashed.bin`, identisch mit dem aktuellen Build. Ob und wie er danach getestet wurde: [unklar].
- **Testgerät:** `cg-00A5D8` (BLE-Name `CALLGREEN-00A5D8`), am Port COM9 des Entwicklungsrechners.
- **Wichtigste offene Punkte:**
  - Hardwaretests von Phase C und D
  - Settle-Test (echte Einschwingzeit)
  - Messung des Stromverbrauchs
  - Versionsverwaltung (das Projekt ist kein Git-Repository)
  - Prod-Base-URL

---

## 2. Produkt und Hardware

### 2.1 Bauteile

- MCU: ESP32-C3-MINI-1-H4X (RISC-V, 4 MB Flash, WLAN 2,4 GHz, BLE 5). Chip-Revision v0.3 laut Monitor [aus Log des Monitors, nicht separat geprüft].
- Laderegler: ETA6003, STAT-Ausgang (Open-Drain, LOW = lädt).
- Sensoren:
  - AHT20 (Temperatur, Luftfeuchte), I2C 0x38
  - BH1750 (Licht), I2C 0x23
  - kapazitiver Bodenfeuchtesensor, über P-FET geschaltet
- AHT20 und BH1750 hängen fest an 3V3 und sind nicht abschaltbar. Das Gate schaltet nur den Bodenfeuchtesensor.
- Kein 32-kHz-Quarz. Die Uhr läuft im Deep Sleep über den internen RC-Oszillator und driftet um einige Prozent, also mehrere Minuten pro Stunde Schlaf möglich.

### 2.2 Pinbelegung PCB v3 (gültig, nicht die aus v5)

| Pin | Funktion | Richtung | Details |
|---|---|---|---|
| IO0 | CHRG_STATUS (ETA6003 STAT) | Eingang | LOW = lädt. Interner Pull-up **an**, weil unklar ist, ob ein externer Pull-up bestückt ist. IO0 ist beim C3 kein Strapping-Pin. |
| IO1 | BAT_ADC (ADC1_CH1) | analog | U_bat = U_adc × 2 (Teiler 470k/470k). 12 dB, kalibriert per `adc_cali` (Curve Fitting). |
| IO4 | MOISTURE (ADC1_CH4) | analog | Rohwert 12 Bit, 12 dB (wie Arduino `analogRead`). Teiler 100k/220k davor, U_sensor = U_adc / 0,6875. |
| IO5 | VBUS_DETECT | Eingang | HIGH = USB steckt. Teiler 100k oben / 150k unten an 5 V, ergibt 3,0 V. **Keine internen Pulls.** Wake-Quelle für den Deep Sleep. |
| IO8 | I2C SDA | | 100 kHz; im I2C-Treiber ist der interne Pull-up eingeschaltet |
| IO9 | I2C SCL | | auch BOOT-Strapping-Pin |
| IO10 | SENSOR_GATE | Ausgang | P-FET, LOW = Sensor AN, HIGH = AUS, externer Pull-up. Wird nach dem Aufwachen als Erstes definiert auf HIGH gesetzt. |

### 2.3 Kalibrierung

- **Bodenfeuchte:** Rohwert 2320 = 0 %, Rohwert 845 = 100 %, linear, begrenzt auf 0 bis 100. Ganzzahl-Arithmetik wie Arduino `map()`. Herkunft der Werte: vom Projekt vorgegeben; ob auf PCB v3 gemessen, ist [unklar].
- **Batterie:** kalibrierte mV per `adc_oneshot_get_calibrated_result`, 8 Samples im Abstand von 10 ms, gemittelt, mal 2.

### 2.4 Gemessene Hardware-Fakten (12.10.2026)

- Aufwachen per USB an IO5 funktioniert, Weckgrund GPIO (7), in beiden Fällen: mit gestecktem USB und beim Einstecken nach dem Abziehen.
- Ursache des früheren Arduino-Problems: ESP-IDF schaltet beim Deep Sleep mit GPIO-Wakeup auf HIGH automatisch den internen Pull-down an IO5. Zusammen mit dem hochohmigen Teiler fiel IO5 auf 0,67 V und galt als LOW. Behoben durch `# CONFIG_ESP_SLEEP_GPIO_ENABLE_INTERNAL_RESISTORS is not set`. **Diese Option muss aus bleiben.**

---

## 3. Entwicklungsumgebung und Werkzeuge

### 3.1 Installation (Windows, Entwicklungsrechner)

- ESP-IDF **v6.1** (nicht v5.x), installiert per EIM über die VS-Code-Extension.
  - IDF: `C:\esp\v6.1\esp-idf`
  - Tools: `C:\Espressif\tools` (Python-venv `C:\Espressif\tools\python\v6.1\venv`)
  - Toolchain `riscv32-esp-elf` esp-15.2.0, CMake 4.0.3, Ninja 1.12.1, esptool v5.5.0.
- **Umgebung aktivieren** (PowerShell): `. C:\Espressif\tools\Microsoft.v6.1.PowerShell_profile.ps1`. Das klassische `export.ps1` scheitert, weil es eine venv am alten Pfad sucht.
- Projektordner: `C:\Users\marsk\callgreen-FW`.
- Flashen und Konsole: nativer USB-Serial/JTAG des C3 über die USB-C-Buchse, Port **COM9**. Kein ESP-Prog, keine externe UART.

### 3.2 Arbeitsweise und Stolperfallen der Umgebung

- **COM9 belegt („Zugriff verweigert“):** Fast immer läuft noch ein alter `idf.py monitor`, z. B. im Terminal der VS-Code-Extension. Diesen Monitor beenden (`Ctrl+]`) oder den Prozess beenden.
- **Nicht parallel bauen:** Zwei Builds im selben `build/`-Ordner kollidieren (`ninja: failed recompaction: Permission denied`). Das gilt auch, wenn `idf.py flash` neu baut, während jemand `sdkconfig` löscht oder einen zweiten Build startet.
- **Vergessenes Flashen:** Ob das Gerät den aktuellen Build hat, zeigt der Vergleich von `build/callgreen_fw.bin` mit `build/callgreen_fw_flashed.bin` (Inhalt und Zeitstempel).
- **Nach Änderungen in `sdkconfig.defaults`:** `sdkconfig` löschen und neu bauen. Sonst behält die bestehende `sdkconfig` die alten Werte.
- **Die VS-Code-Extension trägt neue `.c`-Dateien selbst in `main/CMakeLists.txt` ein,** teilweise doppelt. Nach dem Anlegen neuer Dateien die Liste prüfen.
- **Deep Sleep:** Im Schlaf verschwindet COM9. Der Monitor meldet `Waiting for the device to reconnect` und verbindet sich danach wieder.
- **Flashen bei schlafendem Gerät ohne USB-Strom:** BOOT (IO9) halten, Reset drücken, BOOT loslassen. Danach ist der Chip im Download-Modus.
- **Kein Git-Repository.** Versionsverwaltung fehlt (siehe offene Punkte). Eine `.gitignore` existiert und schließt `build/`, `sdkconfig`, `sdkconfig.defaults.local` und `managed_components/` aus.

---

## 4. Projektstruktur und Code

### 4.1 Dateien im Projektordner

| Datei | Inhalt |
|---|---|
| `CMakeLists.txt` | Projekt `callgreen_fw`, `PROJECT_VER "7.0.0"` (**einzige Versionsquelle**), lädt `sdkconfig.defaults` plus `sdkconfig.defaults.local`, falls vorhanden |
| `sdkconfig.defaults` | alle Build-Einstellungen (Abschnitt 5) |
| `sdkconfig.defaults.local` | gitignored, enthält `CONFIG_CALLGREEN_POP` (PoP für BLE Security 1) |
| `partitions.csv` | Partitionstabelle (Abschnitt 5.3) |
| `main/idf_component.yml` | Managed Components |
| `dependencies.lock` | aufgelöste Versionen: `espressif/network_provisioning` 1.3.1, `espressif/cjson` 1.7.19~2, `espressif/json_generator` 2.0.0, IDF 6.1.0 |
| `planty_firmware_v5.ino` | alte Arduino-Firmware v5 (Referenz, alte Pinbelegung) |
| `Uebergabe_Backend_Firmware_v7.md` | Vertrag v7 |
| `uebergabe_firmware_backend_v8.md` | Ergänzungen v8 |
| `.devcontainer/`, `.vscode/` | Vorlage der Extension; `.vscode/settings.json` zeigt auf `C:\esp\v6.1\esp-idf` |

### 4.2 Module in `main/` (Zeilenzahlen Stand 14.10.)

| Modul | Zeilen | Zuständig für |
|---|---|---|
| `main.c` | 127 | Start, Zustandsmaschine nach Vertrag §2 (Akku/USB × NEU/AKTIV/NICHT ZUGEORDNET), Übergänge zwischen Messzyklus, Online-Modus, Onboarding und Schlaf |
| `cycle.c` | 410 | ein Messzyklus: messen, puffern, Akkuschutz, Backoff, WLAN, SNTP, `POST /readings/batch`, Antwort auswerten; Settle-Test |
| `sensors.c` | 325 | Gate, GPIO-Eingänge, ADC und Kalibrierung, Bodenfeuchte (Median/Min/Max), Batterie, AHT20- und BH1750-Treiber (eigene, über `i2c_master`) |
| `net.c` | 461 | NVS/Netif/WLAN-Init, Verbinden mit gespeicherten Daten, paralleles Verbinden während BLE, Auto-Reconnect, `set_wifi`-Test (RAM) und Übernahme ins NVS, SNTP, HTTPS GET/POST mit Keep-Alive und Wiederholregeln, 401-Behandlung |
| `state.c` | 115 | RTC-Zustand (Magic, Zähler, Flags, Backoff), RTC-Puffer für 24 Messungen, `seq` mit NVS-Blockreservierung |
| `power.c` | 71 | Weckgrund, Deep Sleep mit Timer und USB, Deep Sleep nur USB |
| `device.c` | 152 | device_id aus MAC, BLE-Name, `device_token` im NVS, Gerätezustand mit Log bei Wechsel, `factory_reset`, Kürzen von Secrets für Logs |
| `onboarding.c` | 510 | BLE-Provisioning (`network_provisioning`), Custom Endpoints `claim` und `status`, Claim-POST, Nachlauf-Logik, Wiederherstellen des WLANs nach Fehlern |
| `config.c` | 148 | `config` aus Backend-Antworten und `set_config`, Bereichsprüfung, NVS |
| `commands.c` | 334 | `GET /device/commands`, Ausführen, Ack, idempotent über die id (Liste im NVS) |
| `online.c` | 107 | Online-Modus (USB + AKTIV + WLAN): Abfrage von Befehlen, Messung nach Plan, OTA-Prüfung |
| `ota.c` | 455 | OTA: Angebot prüfen, Download, sha256, Installation, Rollback erkennen und sperren, Gültig-Markierung |
| `version.h` | | `CALLGREEN_FW_VERSION` = `esp_app_get_description()->version`, `CALLGREEN_HW_REV "v3"` |
| `Kconfig.projbuild` | | Menü „Callgreen“ (Abschnitt 5.2) |

### 4.3 Managed Components und warum

- `espressif/network_provisioning` (^1.1.0, aufgelöst 1.3.1): In IDF v6 ist `wifi_provisioning` entfernt. Die APIs heißen jetzt `network_prov_*`.
- `espressif/cjson` (^1.7.19): cJSON gehört in IDF v6 nicht mehr zur IDF.

---

## 5. Build-Konfiguration und Entscheidungen

### 5.1 `sdkconfig.defaults` (wichtige Einträge und Gründe)

| Eintrag | Grund |
|---|---|
| `CONFIG_IDF_TARGET="esp32c3"` | Zielchip |
| `CONFIG_ESP_CONSOLE_USB_SERIAL_JTAG=y` | Konsole über USB-C |
| `# CONFIG_ESP_SLEEP_GPIO_ENABLE_INTERNAL_RESISTORS is not set` | sonst Pull-down an IO5 im Schlaf, USB weckt nicht (2.4) |
| `CONFIG_ESPTOOLPY_FLASHSIZE_4MB=y` | Flashgröße H4X |
| `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y` | OTA-Rollback; ändert den Bootloader (einmaliger USB-Flash pro Gerät) |
| `CONFIG_COMPILER_OPTIMIZATION_SIZE=y` | `-Os`, Image von 1,40 auf 1,30 MiB trotz OTA-Code |
| `CONFIG_PARTITION_TABLE_CUSTOM=y`, `…FILENAME="partitions.csv"` | eigene OTA-Tabelle |
| `CONFIG_ESP_MAIN_TASK_STACK_SIZE=8192` | TLS im Main-Task |
| `CONFIG_MBEDTLS_CERTIFICATE_BUNDLE=y`, `…DEFAULT_FULL=y` | Zertifikats-Bundle |
| `CONFIG_MBEDTLS_CERTIFICATE_BUNDLE_CROSS_SIGNED_VERIFY=y` | `*.convex.site` schickt GTS Root R4 cross-signed von GlobalSign Root CA (R1); R1 fehlt im IDF-Bundle, ohne die Option scheitert TLS mit „No matching trusted root certificate found“ |
| `CONFIG_LWIP_SNTP_MAX_SERVERS=2` | `pool.ntp.org`, `time.nist.gov` |
| `# CONFIG_LWIP_SNTP_STARTUP_DELAY is not set` | Standard ist eine Zufallsverzögerung von 0–5 s vor der ersten SNTP-Anfrage; damit lief das 5-s-Sync-Fenster oft ab. Jetzt Sync etwa 0,1 s nach WLAN (gemessen). |
| `CONFIG_BT_ENABLED=y`, `CONFIG_BT_NIMBLE_ENABLED=y`, Rollen Central und Observer aus | BLE-Provisioning, nur Peripheral (spart RAM/Flash) |
| `CONFIG_ESP_PROTOCOMM_SUPPORT_SECURITY_VERSION_1=y` | seit IDF v6 standardmäßig aus |
| `CONFIG_CALLGREEN_SETTLE_MS=2000`, `CONFIG_CALLGREEN_SAMPLES=20` | Standardwerte für `config`, bis das Backend andere setzt |
| `# CONFIG_CALLGREEN_SETTLE_TEST is not set` | Settle-Test nur bei Bedarf |

### 5.2 Kconfig-Menü „Callgreen“

| Option | Standard | Zweck |
|---|---|---|
| `CONFIG_CALLGREEN_BASE_URL` | `https://dusty-shrimp-80.eu-west-1.convex.site` (Dev-Deployment) | Backend-Basis |
| `CONFIG_CALLGREEN_POP` | leer, Wert in `sdkconfig.defaults.local` | PoP Security 1; nur Buchstaben und Ziffern (Expo ersetzt `$` in `.env`) |
| `CONFIG_CALLGREEN_SETTLE_MS` | 2000 (Bereich 50–30000) | Einschwingzeit, Standard für `config` |
| `CONFIG_CALLGREEN_SAMPLES` | 20 (Bereich 1–200) | Rohwerte pro Messung, Standard für `config` |
| `CONFIG_CALLGREEN_SETTLE_TEST` | aus | Settle-Test statt Messzyklus |
| `CONFIG_CALLGREEN_OTA_TEST_FAIL` | aus | NUR TEST: Absturz nach OTA vor Backend-Kontakt (Rollback-Test) |

Entfernt gegenüber früheren Ständen: `CONFIG_CALLGREEN_WIFI_SSID` und `…PASSWORD` (seit Phase A per Provisioning), `CONFIG_CALLGREEN_SENSOR_ID` und `…READING_INTERVAL_MS` (v6-Endpoints, seit Phase B nicht mehr genutzt).

### 5.3 Partitionstabelle (ab Phase D)

| Name | Typ | Offset | Größe |
|---|---|---|---|
| nvs | data/nvs | 0x9000 | 0x6000 (24 KB) |
| otadata | data/ota | 0xF000 | 0x2000 |
| phy_init | data/phy | 0x11000 | 0x1000 |
| ota_0 | app/ota_0 | 0x20000 | 0x1F0000 (1984 KB) |
| ota_1 | app/ota_1 | 0x210000 | 0x1F0000 (1984 KB) |

- Keine factory-Partition.
- Vor Phase D waren die Slots 0x1E0000 groß (ota_1 bei 0x200000).
- **NVS blieb beim Umstieg an seiner Stelle.** Token, WLAN, `seq`, `config` und Befehlsliste bleiben beim Umflashen erhalten.
- Partitionstabelle und Bootloader lassen sich **nicht per OTA** ändern. Jedes Gerät braucht einmal einen USB-Flash mit einer Firmware ab Phase D. Das gehört in den Ablauf der Beta-Flashes (v8 6.1).
- Image aktuell 0x14DBA0 Byte (1,30 MiB), 33 % des Slots frei. Bootloader 0x5370 Byte.

### 5.4 Wichtige Architektur-Entscheidungen (mit Grund)

1. **Gerätezustand wird aus dem NVS abgeleitet, nicht separat gespeichert.** Keine WLAN-Daten = NEU, WLAN-Daten mit Token = AKTIV, WLAN-Daten ohne Token = NICHT ZUGEORDNET. So kann der Zustand nicht von den Daten abweichen.
2. **WLAN-Daten verwaltet das Provisioning im NVS** (`WIFI_STORAGE_FLASH`). Keine Zugangsdaten im Code oder in Kconfig.
3. **Messen bei ausgeschaltetem WLAN, dann verbinden und senden.** Ausnahme: Im Online-Modus (USB) bleibt das WLAN an.
4. **Eine HTTPS-Verbindung (Keep-Alive) pro Zyklus.** Die Firmware schließt sie, solange BLE läuft, und vor OTA, um Heap zu sparen.
5. **Wiederholung nur, wenn der Request sicher nicht ankam.** Ausnahme: `/readings/batch` wird bei Netzwerkfehlern und 5xx bis zu 3-mal versucht, weil `seq` ihn idempotent macht.
6. **`seq` im NVS in Blöcken zu 100 reserviert.** Das überlebt einen Stromverlust und schreibt nur selten in den Flash. Ohne Zähler im NVS startet eine Zufallsreihe ≤ 16 777 216, damit nach einem Löschen keine alten `(device_id, seq)` wiederkommen.
7. **Puffer im RTC-RAM** (24 Messungen). Er überlebt den Deep Sleep, nicht aber einen Stromverlust oder Reset nach dem Flashen.
8. **BT-Speicher wird nach dem Onboarding freigegeben** (`FREE_BTDM`), damit mehr Heap für TLS frei ist. Folge: Ein zweites Onboarding im selben Boot löst einen Neustart aus.
9. **Log-Level von `security1` auf WARN.** Die IDF-Komponente gibt sonst den Session-Schlüssel der BLE-Verbindung als Hexdump aus.
10. **Eine einzige Versionsquelle** (`PROJECT_VER`). Sie wird im App-Header gespeichert, in allen Requests gesendet und beim OTA gegen das Angebot geprüft.
11. **OTA-Endpoints ohne Bearer-Token.** Ein Fehler dort darf nie den 401-Pfad (Gerät abmelden) auslösen.

---

## 6. Verhalten zur Laufzeit

### 6.1 Start

1. Gate des Bodenfeuchtesensors sofort definiert AUS (IO10 HIGH).
2. 2 s warten, damit der USB-Host die Konsole nach dem Deep Sleep wieder verbunden hat.
3. Banner `--- Callgreen v7.0.0 (HW v3): Aufwachen ---`, Weckgrund (`usb`, `timer`, `cold_boot`).
4. RTC-Zustand prüfen (Magic `0x43470702`). Bei Kaltstart werden Puffer und Zähler zurückgesetzt und Flag 0x40 gesetzt.
5. Sensor-GPIOs und ADC initialisieren; dazu NVS, Netif, WLAN-Treiber.
6. device_id, Token und Zustand laden (Log `Zustand: …`), `config` aus dem NVS laden.
7. OTA-Start-Check: laufende Partition und Zustand loggen, ein Rollback erkennen.
8. Kaltstart-Fenster: War der Reset ein Power-on und der Zustand NEU, darf BLE 10 min auch ohne USB laufen.

### 6.2 Zustände und Modi (Vertrag v7 §2, umgesetzt in `main.c`)

| Situation | Verhalten |
|---|---|
| Akku, AKTIV | Messzyklus, ggf. Befehle (`commands_pending`) und OTA-Angebot, dann Deep Sleep bis zum nächsten Slot (Timer + USB-Wake) |
| Akku, AKTIV, WLAN nicht erreichbar | messen und puffern; WLAN-Versuche nur im Backoff 30 min, 1 h, 2 h, max. 4 h |
| Akku, AKTIV, Akku unter `critical_battery_v` | messen und puffern, kein WLAN, Schlaf bis USB oder 6 h |
| Akku, NEU oder NICHT ZUGEORDNET | Deep Sleep ohne Timer, nur USB weckt (Fallback 6 h, falls GPIO-Wake nicht konfigurierbar) |
| Akku, Kaltstart, NEU | 10 min BLE, dann Deep Sleep nur USB |
| USB, AKTIV, WLAN verbunden | Messzyklus, dann **Online-Modus** (ersetzt den Lademodus aus v6) |
| USB, AKTIV, WLAN nicht erreichbar | BLE-Onboarding, parallel alle 15 s gespeichertes WLAN |
| USB, NEU oder NICHT ZUGEORDNET | BLE-Onboarding, solange USB steckt (parallel gespeichertes WLAN, falls vorhanden) |

### 6.3 Messzyklus (`cycle_run`)

1. Zykluszähler `boot_count` (uint32, zählt Messzyklen) erhöhen.
2. **Messen:**
   - AHT20 und BH1750 initialisieren.
   - Gate an, `settle_ms` warten (Standard 2000), `samples` Rohwerte im Abstand von 50 ms (Standard 20), davon Median, Min und Max, Gate aus.
   - AHT20 lesen (CRC und Busy-Bit geprüft).
   - BH1750 lesen (mindestens 180 ms nach dem Mode-Befehl).
   - Batterie, `charging` (IO0), `usb` (IO5).
   - Bei Lesefehlern: Flags 0x04 und 0x08, Werte `null`. Ist die Bodenfeuchte nicht lesbar: `moisture_pct: null`, Rohwerte fehlen.
3. `seq` vergeben, `measured_at` = Systemzeit, Messung in den RTC-Puffer. Ist er voll, fällt die älteste Messung weg.
4. **Akkuschutz** (nur ohne USB): unter `critical_battery_v` → Ende, Schlaf 6 h. Unter `low_battery_v` → nur Log.
5. **Backoff** (nur ohne USB): Ist `next_wifi_at` in der Zukunft → Ende, Schlaf bis zum nächsten Slot.
6. **WLAN verbinden** (15 s). Bei Fehler: Flag 0x01, Backoff verdoppeln (30 min … 4 h), Schlaf bis zum Slot.
7. **SNTP:** Warten auf echten Sync (5 s; bei nie gestellter Uhr 15 s).
   - Sync: `measured_at` der aktuellen Messung auf die synchronisierte Uhr zurückrechnen, `time_synced: true`.
   - Kein Sync: Flag 0x02, weiterlaufende Uhr, `time_synced: false`.
8. Nächsten Slot berechnen, `next_contact_at`, dann **`POST /readings/batch`** mit allen gepufferten Messungen (höchstens 24).
9. **Antwort 200:**
   - Messungen aus `accepted_seqs` raus.
   - `config` übernehmen.
   - `commands_pending` und `ota` merken.
   - `error_flags` zurücksetzen.
   - Neue Firmware als gültig markieren, ein gemeldetes Rollback als erledigt markieren.
10. Das WLAN bleibt an. Der Aufrufer entscheidet: Befehle, OTA, Online-Modus oder `net_wifi_off()` und Schlaf.

Messplan (lokale Zeit Europe/Berlin, TZ `CET-1CEST,M3.5.0,M10.5.0/3`): 0–5 Uhr Pause (Schlaf bis 5:00), 5–13 Uhr stündlich, 13–20 Uhr halbstündlich, 20–24 Uhr Pause (Schlaf bis Mitternacht, dann bis 5:00). Berechnung identisch zu v4.3/v5/v6, Fallback 30 min bei unplausiblem Ergebnis (Flag 0x80).

### 6.4 Fehlerbehandlung beim Senden (v7 §10 mit v8)

| Antwort | Verhalten |
|---|---|
| 200 | wie 6.3 Schritt 9 |
| 401 | Token löschen, **Puffer leeren** (v8 5.7, ersetzt v7 §10), Zustand NICHT ZUGEORDNET, keine weiteren Sendeversuche |
| andere 4xx (400, 403, 404 …) | Puffer verwerfen, Flag 0x10 im nächsten Status |
| 5xx oder Netzwerkfehler | bis zu 3 Versuche (2 s, 4 s), dann bleibt der Puffer, Flag 0x10 |

Transportebene, für alle Requests:

| Fehler | Verhalten |
|---|---|
| Verbindungsaufbau gescheitert (`ESP_ERR_HTTP_CONNECT`) | 1 Wiederholung nach 1 s |
| Senden unvollständig (`ESP_ERR_HTTP_WRITE_DATA`) | sofort, wenn die Verbindung wiederverwendet war; sonst nach 1 s |
| Keep-Alive-Verbindung vom Server geschlossen | sofort neu verbinden |
| Timeout nach dem Senden | **keine** Wiederholung (Code −11) |
| sonstige Fehler | Code −1 |

**IDF-Eigenheit:** Bei 401 bricht `esp_http_client_perform` mit `ESP_ERR_NOT_SUPPORTED` ab, weil es Basic- oder Digest-Auth versucht. Die Firmware liest den Status trotzdem aus und behandelt 401 korrekt. Das Backend darf **kein** `WWW-Authenticate: Basic`/`Digest` senden.

### 6.5 Online-Modus (USB + AKTIV + WLAN, `online.c`)

- Start: Log `Online-Modus: …`, Auto-Reconnect alle 5 s, sofort `GET /firmware/latest` (OTA) und `GET /device/commands`.
- Schleife alle 250 ms:
  - USB-Abzug prüfen → Ende, Deep Sleep bis zum nächsten Slot.
  - Zustand prüfen (401 → Ende).
  - WLAN-Verlust länger als 2 min → Ende, BLE-Onboarding.
  - Slot fällig → Messzyklus, OTA-Angebot bearbeiten.
  - Alle `online_poll_s` (Standard 10 s) Befehle abfragen.
  - Alle 60 s ein Log mit Akku, STAT, Heap und Zeit bis zur nächsten Messung.
- Das WLAN bleibt während der Messung an (bekannte Abweichung von „Messen mit WLAN aus“).

### 6.6 Befehle (`commands.c`, v7 §6, v8 4.3)

- `GET /device/commands` mit Bearer: höchstens 10 Befehle pro Abfrage, der Reihe nach.
- **Idempotent über die `id`:**
  - Format `c_` plus Convex-ID, höchstens 48 Zeichen, erlaubt sind `A–Z a–z 0–9 _ -`.
  - Die letzten 8 ausgeführten ids liegen mit Ergebnis im NVS (Key `cmd_done`).
  - Kommt eine id erneut, wird nur das Ack wiederholt.
- **Ack:** `POST /device/commands/ack` `{"id","result":"ok"|"failed","detail"}`, 2 Versuche. Doppelte Acks nimmt das Backend an.

| Typ | Verhalten |
|---|---|
| `measure_now` | sofort Messzyklus mit `wake_cause: "command"`, Ack `ok` bei Batch-200, sonst `failed/no_backend` |
| `set_config` | wie `config`; `ok`, wenn mindestens ein Feld gültig ist, sonst `failed/invalid_params` |
| `set_wifi` | SSID 1–32 Byte; Passwort leer, 8–63 oder 64 Hex. Die neuen Daten werden nur im RAM getestet (15 s). **Erfolg = IP und Ack 200 über das neue WLAN**, erst dann ins NVS. Bei Fehler: bisheriges WLAN wieder herstellen, Ack `failed` mit `auth_failed`, `not_found`, `timeout` oder `no_backend` (`invalid_params` bei ungültigen Parametern). Ist auch das alte WLAN weg, folgt das Ack beim nächsten Kontakt. SSID und Passwort erscheinen in keinem Log. |
| `factory_reset` | erst Ack `ok`, nach 200: Token, WLAN (`esp_wifi_restore`) und RTC-Puffer löschen, Neustart als NEU. `seq`-Zähler und `config` bleiben. Ohne Ack-200 keine Ausführung. Das Backend entwertet das Token beim Ack. |
| `ota_now` | `GET /firmware/latest`, Installation (erzwingt auch gesperrte Versionen), Ack gemäß 7.6 |
| `unclaim` und unbekannte Typen | `failed/unsupported`; `unclaim` entfällt, weil das Backend stattdessen das Token entwertet |

- Im Akkubetrieb holt die Firmware Befehle nur bei `commands_pending: true` in der Batch-Antwort ab, dann sofort und vor dem Schlaf.

### 6.7 OTA (`ota.c`, v7 §7, v8 6)

- **Angebot:**
  - `ota` aus dem Batch, vom Backend nach `device_id` und Rollout gefiltert.
  - Dazu `GET /firmware/latest?hw_rev=v3&fw_version=…&device_id=…` bei `ota_now` und beim Start des Online-Modus.
  - 204 oder `ota: null` bedeutet kein Update. Beide Endpoints und der Download laufen ohne Token.
- **Prüfungen:**
  - `version` 1–31 Zeichen und ungleich der laufenden.
  - `url` nur `https://`, höchstens 256 Zeichen.
  - `sha256` 64 Hex-Zeichen.
  - `size` größer 0 und passt in den Slot.
  - Version nicht gesperrt.
  - Nicht pausiert (nach 3 Fehlversuchen 24 h).
  - Akku: mit USB immer, sonst nur bei `battery_v` ≥ `low_battery_v` + 0,2 V.
- **Download:**
  - `esp_https_ota` mit Zertifikats-Bundle, 15 s Timeout.
  - Image-Header prüfen: Projektname `callgreen_fw`, Version gleich dem Angebot.
  - Größe prüfen.
  - **sha256 über die komplette `.bin`**: aus dem geschriebenen Slot zurückgelesen und mit PSA (`psa_hash_*`) berechnet. Bewusst nicht `esp_partition_get_sha256`, das liefert den internen Image-Hash.
  - Dann `esp_https_ota_finish` (IDF-Prüfung, Boot-Partition setzen) und Neustart.
- **Gültigkeit:**
  - Die neue Version startet als `PENDING_VERIFY`.
  - Gültig bei der ersten 200 von `/readings/batch` oder `/device/commands`.
  - Startet das Gerät vorher neu, rollt der Bootloader zurück. Dazu zählen ein Absturz, der Watchdog, ein Stromverlust **und auch das Aufwachen aus dem Deep Sleep ohne Backend-Kontakt.**
- **Rollback erkennen:**
  - beim Start über `esp_ota_get_last_invalid_partition()`
  - Version im NVS sperren (`ota_state`)
  - im nächsten Batch `status.ota_rollback_version` melden, bis ein Batch-200 durch ist
  - Automatisch angeboten wird die gesperrte Version nicht erneut installiert; `ota_now` versucht sie trotzdem und hebt die Sperre auf.
- **Stromverlust beim Download:** Die alte Version bleibt aktiv, der nächste Versuch beginnt von vorn.
- **Fehlversuche:** werden im RTC gezählt. Bei Stromverlust geht der Zähler verloren, dann wird einfach neu versucht.

### 6.8 BLE-Onboarding (`onboarding.c`, v7 §4, v8 2)

- Espressif Provisioning über BLE (`network_provisioning`), Security 1 mit PoP, Name `CALLGREEN-XXXXXX`.
- Custom Endpoints `claim` und `status` (Formate in 7.1).
- **Paralleles WLAN:** Liegen WLAN-Daten vor, versucht das Gerät sie alle 15 s parallel.
  - `start_provisioning` leert die WLAN-Konfiguration im RAM. Die Firmware setzt sie vorher gesichert wieder ein.
  - Der Manager ignoriert WLAN-Events, bis über BLE Zugangsdaten kommen.
- **Claim:** startet, sobald `claim_token` und WLAN-Verbindung da sind, `POST /device/claim` ohne Auth. Die TLS-Verbindung wird danach geschlossen (Heap).
- **Nachlauf:**
  - Direkt nach `claim: ok` bleibt BLE höchstens 60 s offen, **nur solange die App verbunden ist**. Trennt die App, endet BLE sofort und wirbt nicht erneut.
  - Schickt die App im Nachlauf WLAN-Daten, pausiert er bis zum Ergebnis (höchstens 30 s). Erfolg: wieder 60 s. Fehler: zuletzt funktionierendes WLAN wiederherstellen, BLE offen, solange die App verbunden ist.
- **Ein Claim pro Session:**
  - Weitere `claim`-Aufrufe → `already_claimed`.
  - Ein `claim_token`, der während eines laufenden Claims ankommt, wird bei Erfolg verworfen, bei `failed` als Nächstes verwendet.
  - Nach `failed` wird ein neuer Token angenommen.
- **WLAN-Fehler über BLE** (`AUTH_ERROR`, `NETWORK_NOT_FOUND`): Der Manager-Zustand wird zurückgesetzt, damit die App neue Daten senden kann.
  - Die Espressif-Funktion dafür (`network_prov_mgr_reset_wifi_sm_state_on_failure`) **löscht dabei die gespeicherten WLAN-Daten im NVS**. Die Firmware stellt deshalb das zuletzt funktionierende WLAN sofort wieder her.
- **Kein Auto-Stop:** `network_prov_mgr_disable_auto_stop` ist aktiv; das Ende steuert die Firmware.
- **AKTIV mit verbundenem gespeicherten WLAN** und ohne begonnenen Claim: BLE endet sofort (`BLE nicht mehr noetig`).
- **Wann BLE läuft:**
  - USB-Abzug beendet BLE.
  - Ausnahme ist das 10-min-Fenster nach dem Einsetzen der Zelle im Zustand NEU.
  - Im Akkubetrieb sonst nie BLE.
- **Heap gemessen:**
  - BLE und WLAN aktiv: 112–118 KB frei.
  - Minimum während des Claim-TLS: 67–72 KB.
  - Nach BLE-Ende: rund 150–180 KB frei.

### 6.9 Logs und Secrets

- Keine Klartext-Secrets in Logs. PoP nie, WLAN-Passwort nie. `claim_token` und `device_token` nur mit den ersten 4 Zeichen plus Länge (`device_redact`).
- Zustandswechsel als Warnung: `Zustand: X -> Y (Grund)`. Modi als `Modus: …`.
- Bei `set_wifi` steht im Log nur die SSID-Länge. Im BLE-`status` und beim Verbinden steht die SSID.

---

## 7. Schnittstellen (BLE, HTTP, Datenformate)

### 7.1 BLE

- **Name:** `CALLGREEN-` plus die letzten 3 Byte der WLAN-STA-MAC, Hex in Großbuchstaben.
- **device_id:** `cg-` plus dieselben 6 Zeichen.
- **Endpoint `claim`:**
  - Request `{"claim_token":"<Base32, 1–64>"}`.
  - Antwort `{"ok":true}`, `{"ok":false,"error":"invalid_token"}` oder `{"ok":false,"error":"already_claimed"}`.
- **Endpoint `status`:**
  - Request wird ignoriert.
  - Antwort `{"wifi":"connected"|"disconnected","claim":"pending"|"ok"|"failed","http":<Code oder 0>,"ssid":"…"}`. `ssid` nur bei verbundenem WLAN; die App ignoriert das Feld derzeit.
- **Ablauf in der App** (v8 2.2): verbinden, `claim`, optional WLAN-Daten (entfällt, wenn `status` schon `connected` + `ok` meldet), `status` abfragen bis `ok` oder `failed`, trennen.
- **Zweiter Security-1-Handshake** auf derselben Verbindung wird laut IDF-Code akzeptiert (Session-Neustart) [auf Hardware nicht getestet].

### 7.2 HTTP-Endpoints (Base-URL `CONFIG_CALLGREEN_BASE_URL`)

| Endpoint | Auth | Firmware sendet / erwartet |
|---|---|---|
| `POST /device/claim` | nein | `{"device_id","claim_token","fw_version","hw_rev"}` → 200 `{"device_token", "config"?}`, 400, 410 |
| `POST /readings/batch` | Bearer | siehe 7.3 → 200 `{"accepted_seqs","config","commands_pending","ota"}` |
| `GET /device/commands` | Bearer | → 200 `{"commands":[{"id","type","params"}]}`; leer: `{"commands":[]}` |
| `POST /device/commands/ack` | Bearer | `{"id","result","detail"}` |
| `GET /firmware/latest?hw_rev=v3&fw_version=…&device_id=…` | nein | → 204 oder 200 `{"version","url","sha256","size"}` |
| Download `url` (z. B. `…/firmware/file/<version>?hw_rev=v3`) | nein | Binärdatei, Content-Length gesetzt, keine Weiterleitung |
| `/readings`, `/logs` (v6) | | von der Firmware seit Phase B **nicht mehr genutzt** |

Alle Requests: `Content-Type: application/json`, Timeout 15 s. TLS über das Zertifikats-Bundle (Kette `*.convex.site` → WE1 → GTS Root R4, cross-signed von GlobalSign R1).

### 7.3 `POST /readings/batch` (Format)

```json
{
  "device_id": "cg-00A5D8",
  "fw_version": "7.0.0",
  "readings": [
    {
      "seq": 1234567,
      "measured_at": 1760346000,
      "time_synced": true,
      "moisture_pct": 47,
      "moisture_raw": 1680, "moisture_raw_min": 1672, "moisture_raw_max": 1691,
      "temperature_c": 21.4, "humidity_pct": 48.2, "lux": 312,
      "battery_v": 4.08, "charging": false, "usb": true
    }
  ],
  "status": {
    "boot_count": 212, "wake_cause": "timer", "wifi_connect_ms": 1850, "rssi": -61,
    "error_flags": 0, "buffered_count": 0, "next_contact_at": 1760349600,
    "ota_rollback_version": "7.0.3"
  }
}
```
- `temperature_c`, `humidity_pct`, `lux`: `null` bei Sensorausfall.
- `moisture_pct: null`: nur, wenn der ADC gar nichts liefert. Dann fehlen die drei Rohwert-Felder.
- `time_synced`: siehe 6.3 Schritt 7. Gepufferte Messungen aus Zyklen ohne Sync bleiben `false` und werden nicht nachkorrigiert. Ohne je einen Sync seit dem Einsetzen der Zelle liegt `measured_at` nahe 1970.
- `buffered_count`: Zahl der **älteren** Messungen im Batch, ohne die aktuelle.
- `wake_cause`: `timer`, `usb`, `cold_boot`, `command`. Weitere Zyklen im selben Boot (Online-Modus) melden `timer`.
- `ota_rollback_version`: optional, nur nach einem Rollback bis zum nächsten Batch-200.
- `seq`: streng monoton innerhalb einer Zählerreihe, Lücken möglich. Nach einem kompletten Flash-Löschen startet eine neue Reihe, die kleiner sein kann. Das Backend nimmt nirgends an, dass `seq` nur steigt (bestätigt).

### 7.4 `error_flags` (Bitmaske)

| Bit | Bedeutung |
|---|---|
| 0x01 | WLAN fehlgeschlagen |
| 0x02 | Zeit: kein SNTP-Sync (Fallback auf weiterlaufende Uhr oder Uhr ungültig) |
| 0x04 | AHT20 fehlt oder Lesefehler |
| 0x08 | BH1750 fehlt oder Lesefehler |
| 0x10 | Senden fehlgeschlagen oder Puffer verworfen |
| 0x40 | Kaltstart (RTC-Zustand neu) |
| 0x80 | Schlafberechnung unplausibel |

Die Flags sammeln sich, bis ein Batch mit 200 durchgeht; dann werden sie zurückgesetzt.

### 7.5 `config` (in Claim- und Batch-Antwort, per `set_config`)

| Feld | Bereich | Standard |
|---|---|---|
| `settle_ms` | 50–30000 | 2000 |
| `samples` | 1–200 | 20 |
| `low_battery_v` | 3,0–4,2 | 3,4 (nur Log; OTA-Grenze im Akkubetrieb = Wert + 0,2 V) |
| `critical_battery_v` | 2,8–4,0, kleiner als `low_battery_v` | 3,2 |
| `online_poll_s` | 2–3600 | 10 |

- Ein fehlendes Feld behält den NVS-Wert, `{}` ändert nichts.
- Ein ungültiges Feld wird ignoriert.
- Die beiden Akkuwerte werden zusammen geprüft.
- Gespeichert wird nur bei einer Änderung (NVS-Key `config`).

### 7.6 `detail`-Werte im Ack (für App-Texte, v8 4.3 und 6.3)

| Befehl | `result` / `detail` | Bedeutung |
|---|---|---|
| alle | `ok` / leer | ausgeführt |
| `set_wifi` | `failed` / `auth_failed` | Passwort falsch, altes WLAN bleibt |
| `set_wifi` | `failed` / `not_found` | Netz nicht gefunden, altes WLAN bleibt |
| `set_wifi` | `failed` / `timeout` | keine IP in 15 s, altes WLAN bleibt |
| `set_wifi`, `measure_now` | `failed` / `no_backend` | Backend über das (neue) WLAN nicht erreichbar bzw. Batch nicht bestätigt |
| `set_wifi`, `set_config`, alle | `failed` / `invalid_params` | Parameter ungültig, kein gültiges `config`-Feld, oder `type` fehlt |
| unbekannt, `unclaim` | `failed` / `unsupported` | Typ nicht unterstützt |
| `ota_now` | `ok` / leer | installiert, Neustart folgt |
| `ota_now` | `ok` / `no_update` | kein Update oder läuft bereits |
| `ota_now` | `failed` / `low_battery` | Akku zu schwach |
| `ota_now` | `failed` / `download_failed` | Abbruch, Timeout, falsche Größe, `/firmware/latest` nicht erreichbar |
| `ota_now` | `failed` / `sha256_mismatch` | Prüfsumme stimmt nicht |
| `ota_now` | `failed` / `invalid_image` | Image passt nicht (Projekt/Version), Angebot unvollständig, oder IDF-Prüfung scheitert |
| `ota_now` (Firmware vor Phase D) | `failed` / `not_supported` | entfällt ab Phase D |

### 7.7 NVS-Inhalte (Namespace `callgreen`, dazu die WLAN-Daten der IDF)

| Key | Inhalt |
|---|---|
| `dev_token` | `device_token` (≤ 64 Zeichen) |
| `seq_resv` | erste noch nicht reservierte `seq` |
| `config` | Konfiguration (Blob, Version 1) |
| `cmd_done` | letzte 8 Befehls-ids mit Ergebnis (Blob) |
| `ota_state` | gesperrte (zurückgerollte) Version, Meldung offen ja/nein |
| IDF-intern | WLAN-Daten (STA-Konfiguration) |

Zurücksetzen auf NEU beim Entwickeln: `python -m esptool --chip esp32c3 -p COM9 erase-region 0x9000 0x6000`. Das löscht das ganze NVS, also auch `seq` (dann startet eine neue Zufallsreihe).

---

## 8. Test- und Umsetzungsstand

### 8.1 Auf Hardware getestet (mit Ergebnis)

| Datum | Test | Ergebnis |
|---|---|---|
| 12.10. | USB-Wakeup IO5 (gesteckt und nach Wiedereinstecken) | bestanden, Weckgrund 7 |
| 13.10. | Phase A: NICHT ZUGEORDNET mit gespeichertem WLAN, BLE an, paralleles WLAN | bestanden |
| 13.10. | PoP mit `$` aus Expo-`.env` | „Key mismatch“, Ursache Expo-Variablenersetzung; neuer alphanumerischer PoP |
| 13.10. | Claim per BLE (NEU und NICHT ZUGEORDNET) | 200, Token 43 Zeichen; zwei Logik-Fehler gefunden und behoben (zu früher Stopp, zweites Onboarding möglich) |
| 13.10. | Claim, erster Versuch mit DNS-Fehler (`getaddrinfo` 202) | Wiederholung nach 1 s erfolgreich |
| 14.10. | Phase B: normaler Zyklus mit Batch | laut Rückmeldung „weitgehend getestet“; Details der Einzeltests [unklar] |
| 14.10. | 401 bei `/readings/batch` | zuerst gescheitert (IDF meldete `ESP_ERR_NOT_SUPPORTED`), nach dem Fix bestanden |
| 14.10. | SNTP nach frischer WLAN-Verbindung | zuerst 2 von 2 gescheitert (Startverzögerung), nach dem Fix Sync 0,1 s nach WLAN |
| 14.10. | Onboarding nach 401 mit gespeichertem WLAN, App ohne WLAN-Daten | zuerst 5-min-Warten gefunden, nach dem Fix bestanden („jetzt funzts“) |
| 14.10. | Heap im Onboarding | 112–118 KB frei, Minimum beim Claim 67–72 KB |

### 8.2 Gebaut, aber nicht (oder nicht nachweislich) auf Hardware getestet

- **Phase B, offen:**
  - Puffer über mehrere Zyklen (Router aus und wieder an)
  - Backoff im Akkubetrieb
  - Akkuschutz unter `critical_battery_v`
  - `config` vom Backend
  - 4xx-Verwerfen
  - Puffer leeren bei 401 (ab Phase C)
  - Zufallsstart der `seq`
  - Puffer leeren bei neuer `seq`-Reihe
  - `moisture_pct: null`
- **Phase C, alles:**
  - Online-Modus
  - `measure_now`, `set_config`, `set_wifi` (Erfolg, `auth_failed`, `not_found`, `no_backend`)
  - Idempotenz
  - `factory_reset` (inkl. Erhalt von `seq`)
  - `unclaim`/unbekannt
  - WLAN-Verlust im Online-Modus
  - Befehle im Akkubetrieb
- **Phase D, alles:**
  - erster USB-Flash mit neuer Partitionstabelle und Rollback-Bootloader. Geflasht am 14.10., 13:47; ob das Gerät danach normal lief: [unklar]
  - normales Update
  - sha256-Fehler
  - echtes Rollback mit `CONFIG_CALLGREEN_OTA_TEST_FAIL`
  - Stromverlust beim Download
  - Akkugrenze
  - `status.ota_rollback_version`
  - Wirkung von `-Os` auf das Gesamtverhalten
- **Onboarding:**
  - zweiter Security-1-Handshake auf derselben Verbindung
  - Wiederherstellen des WLANs nach `AUTH_ERROR` mit vorher funktionierendem WLAN
  - 10-min-Kaltstart-Fenster
- **Settle-Test:** nicht gelaufen. Ein Settle-Test-Image lief am 14.10. kurz auf dem Gerät; Ergebnis/Log nicht bei mir angekommen [unklar].

### 8.3 Testpläne (Kurzform; ausführlich in den Chat-Antworten und in v8)

**Phase C** (Gerät AKTIV, USB):
1. Online-Modus startet.
2. `measure_now` innerhalb von 10 s.
3. `set_config`: gültig, dann `{"samples":0}` → `invalid_params`.
4. `set_wifi`: falsches Passwort, erfundene SSID, zweites echtes Netz (Hotspot) und zurück.
5. Idempotenz: dieselbe id erneut ausliefern.
6. `unclaim` und `ota_now`.
7. Router aus länger als 2 min.
8. Akkubetrieb mit `commands_pending`.
9. 401 im Online-Modus.
10. `factory_reset` zuletzt: `seq` muss danach weiter steigen.

**Phase D:**
1. Einmal per USB flashen. Erwartet: `ota: Firmware 7.0.0 aus ota_0, Zustand ohne OTA-Eintrag`.
2. `PROJECT_VER` 7.0.1 bauen (nicht flashen), mit `scripts/publish_firmware.mjs` hochladen (Backend-Repo), Rollout nur `cg-00A5D8`, `ota_now`.
3. 7.0.2 korrekt hochladen, `sha256` im Convex-Dashboard ändern → `sha256_mismatch`.
4. 7.0.3 mit `CONFIG_CALLGREEN_OTA_TEST_FAIL` → Absturz, Rollback, Sperre, `ota_rollback_version`.
5. Stromverlust beim Download.
6. `low_battery_v` 4,2 im Akkubetrieb mit Zelle unter 4,2 V → verschoben.

**Settle-Test:** `CONFIG_CALLGREEN_SETTLE_TEST` per menuconfig einschalten, flashen, Sensor in Erde. 60 s Rohwerte alle 100 ms; daraus die Einschwingzeit bestimmen und per `config.settle_ms` setzen.

---

## 9. Bekannte Probleme, Risiken, Einschränkungen

1. **Online-Modus misst mit eingeschaltetem WLAN.** Ob das den ADC-Wert merklich stört, ist nicht gemessen [unklar].
2. **Rollback auch bei harmlosem WLAN-Ausfall:** Erreicht eine neue Firmware im ersten Durchlauf das Backend nicht, rollt sie beim nächsten Start zurück, auch nach einem Deep Sleep. Das ist gewollt, kann aber ein eigentlich gutes Update verwerfen, wenn das WLAN zufällig gerade weg war. Das Backend sieht es an `ota_rollback_version`.
3. **Zweites BLE-Onboarding im selben Boot erzwingt einen Neustart** (BT-Speicher freigegeben).
4. **DNS-Fehler beim ersten Claim** (einmal beobachtet, BLE und WLAN gleichzeitig aktiv). Die Wiederholung half. Eine zweite Wiederholung ist nicht eingebaut.
5. **Claim wird bewusst nicht aggressiv wiederholt:** Der `claim_token` ist einmalig. Ein zweiter Versuch nach einem Timeout würde 410 liefern, obwohl der erste geklappt haben könnte.
6. **Puffer bei 401 wird geleert** (gewollt, Datenschutz). Bis zu 24 unbestätigte Messungen gehen verloren.
7. **Puffer und Fehlversuchszähler für OTA liegen im RTC-RAM.** Sie überleben weder einen Stromverlust noch einen Reset nach dem Flashen.
8. **Ohne je einen SNTP-Sync** seit dem Einsetzen der Zelle liegen `measured_at` gepufferter Messungen nahe 1970 (`time_synced: false`).
9. **`low_battery_v` hat auf dem Gerät keine Wirkung außer Log und OTA-Grenze.** Nutzerhinweise erzeugt das Backend aus `battery_v`.
10. **Abfragelast im Online-Modus:** etwa 8 640 Requests pro Tag und Gerät bei 10 s. Für die Beta bestätigt, `online_poll_s` ist per `config` änderbar.
11. **Restrisiko `seq`:** Ein neuer Zufallsstart nach einem kompletten Flash-Löschen kann in einem früher benutzten Bereich landen. Dann bestätigt das Backend neue Messungen als Duplikat, ohne sie zu speichern.
12. **Prod-Base-URL ist als Kconfig fest eingebaut.** Ein Wechsel braucht eine neue Firmware (per OTA möglich, sobald Phase D getestet ist).
13. **OTA-Download ohne Token** (Beta-Entscheidung des Backends). Aktive Releases sind öffentlich abrufbar.
14. **Stromverbrauch nicht gemessen** (Deep Sleep, Zyklus, Online-Modus). Akkulaufzeit [unklar].
15. **ETA6003 STAT:** interner Pull-up gesetzt. Ob ein externer bestückt ist, ist [unklar]. Der interne zieht nur Strom, während geladen wird.

---

## 10. Offene Punkte und nächste Schritte

### Firmware (priorisiert)

1. Hardwaretest Phase C (8.3), Logs auswerten, Fehler beheben.
2. Hardwaretest Phase D (8.3). Vorher klären, ob der USB-Flash vom 14.10. sauber lief [unklar].
3. Restliche Tests aus Phase B: Puffer, Backoff, Akkuschutz, `config` vom Backend.
4. Settle-Test fahren und `settle_ms` per `config` setzen.
5. **Versionsverwaltung einrichten** (`git init`, `.gitignore` ist vorhanden). Dann eine erste Version 7.0.0 als Tag.
6. Stromverbrauch messen (Deep Sleep, Messzyklus, Online-Modus) und Akkulaufzeit abschätzen.
7. Prüfen, ob WLAN während der Messung im Online-Modus den ADC beeinflusst. Falls ja, WLAN dafür kurz trennen.
8. Ablauf der Beta-Flashes festlegen: einmal USB-Flash mit Phase D pro Gerät; danach nur OTA.
9. Optional: zweite Wiederholung bei DNS-Fehlern während BLE; `ssid` in der App anzeigen.

### Backend (laut letzter Rückmeldung)

- `status.ota_rollback_version` annehmen (Prompt an Backend lief am 14.10.) [Umsetzung unklar].
- Prod-Deployment und endgültige Base-URL vor der Beta (offen).
- OTA-Download später mit Authentifizierung (Beta: ohne Token).
- `config` pro Gerät mit den Bereichen aus 7.5 (vom Backend bestätigt).

### App

- `already_claimed` und `invalid_token` behandeln [unklar].
- Texte für alle `detail`-Werte (7.6).
- PoP bleibt alphanumerisch; nach Änderung neuer JS-Build (`EXPO_PUBLIC_*` wird beim Bündeln eingebaut).
- Hinweis in der App: Ein zugeordneter, online erreichbarer Sensor ist per BLE nicht sichtbar. Neu einrichten über `factory_reset`, Entfernen über Token-Entwertung (Backend).

### Hardware

- Herkunft und Gültigkeit der Moisture-Kalibrierung 2320/845 für PCB v3 klären.
- Externer Pull-up an STAT (IO0) bestückt ja/nein.

---

## 11. Abhängigkeiten zu anderen Bereichen

| Von | Was | Geliefert |
|---|---|---|
| Hardware | Pinbelegung PCB v3, Teiler, Pull-ups | ja (Teil unklar: STAT-Pull-up) |
| Hardware | Moisture-Kalibrierung | Werte ja, Herkunft unklar |
| Backend | `POST /device/claim` mit Besitzerregeln | ja, auf Hardware getestet |
| Backend | `POST /readings/batch` (§5, §10, Idempotenz, 401/403/400/500) | ja (Dev), mit Firmware getestet |
| Backend | `config` pro Gerät | ja |
| Backend | 401 nur bei ungültigem/ersetztem Token, kein `WWW-Authenticate` Basic/Digest | ja |
| Backend | `GET /device/commands`, `POST /device/commands/ack` | in Arbeit (Stand 14.10.) [unklar] |
| Backend | Token entwerten bei `factory_reset`-Ack und beim Entfernen eines Sensors | zugesagt |
| Backend | `GET /firmware/latest`, Datei-Endpoint, `ota` im Batch, `scripts/publish_firmware.mjs` | ja (Dev) |
| Backend | `status.ota_rollback_version` | zugesagt [unklar] |
| Backend | Prod-Base-URL | offen |
| App | PoP-Build, `status`-Polling, Retry bei `claim: failed`, WLAN-Daten optional | laut App-Rückmeldung umgesetzt |
| App | Texte für `detail`-Werte | offen |

---

## 12. Erkenntnisse und Stolperfallen

- **IDF v6 statt v5:** Mehrere APIs haben sich geändert.
  - `esp_deep_sleep_enable_gpio_wakeup` heißt jetzt `esp_sleep_enable_gpio_wakeup_on_hp_periph_powerdown`.
  - `esp_sleep_get_wakeup_cause` ist veraltet; neu ist `esp_sleep_get_wakeup_causes` (Bitmaske).
  - `wifi_provisioning` ist entfernt; Ersatz ist `network_provisioning` (Managed Component).
  - cJSON ist nicht mehr Teil der IDF.
  - Security 1 ist standardmäßig aus.
  - mbedTLS 4 / PSA: Hashing über `psa_hash_*`.
- **`security1` loggt den Session-Schlüssel auf INFO.** Immer `esp_log_level_set("security1", ESP_LOG_WARN)`.
- **`network_prov_mgr_reset_wifi_sm_state_on_failure()` löscht die gespeicherten WLAN-Daten** (leere Konfiguration mit Speicher im Flash).
- **`network_prov_mgr_start_provisioning()`** leert die WLAN-Konfiguration im RAM und trennt die Verbindung.
- **`esp_http_client` bei 401:** Ohne `WWW-Authenticate` gibt es `ESP_ERR_NOT_SUPPORTED`, der Status ist aber lesbar. Mit `Basic`/`Digest` würde der Client still einen zweiten Request senden.
- **`esp_http_client_get_status_code` nach einem Fehler vor dem Header-Empfang** kann einen alten Status enthalten. Die Firmware legt den Client nach jedem Fehler neu an.
- **lwIP SNTP** wartet standardmäßig zufällig 0–5 s vor der ersten Anfrage.
- **`esp_sntp_get_sync_status()`** meldet `COMPLETED` nur einmal und setzt sich beim Lesen zurück.
- **Zertifikats-Bundle und `*.convex.site`:** Ohne `CROSS_SIGNED_VERIFY` scheitert TLS, obwohl `DEFAULT_FULL` aktiv ist.
- **Expo-`.env` ersetzt `$NAME`.** Secrets mit `$` werden still verändert.
- **Rollback:** Jeder Neustart im Zustand `PENDING_VERIFY` führt zum Rollback, auch das Aufwachen aus dem Deep Sleep.
- **`esp_partition_get_sha256`** liefert nicht den Hash der `.bin`-Datei.
- **Arduino-Firmware v5** hatte WLAN-Daten im NVS gespeichert (`WiFi.begin` persistiert). Darum war das Testgerät beim ersten v7-Start NICHT ZUGEORDNET statt NEU.
- **Python-Hilfsskripte über die Shell:** Escape-Sequenzen wie `'\0'` können als echtes Nullbyte in C-Dateien landen. Skripte lieber als Datei schreiben.

---

## 13. Kurzreferenz: Befehle und erwartete Log-Zeilen

### Befehle (PowerShell)

```powershell
. C:\Espressif\tools\Microsoft.v6.1.PowerShell_profile.ps1
cd C:\Users\marsk\callgreen-FW
idf.py build                          # bauen
idf.py -p COM9 flash monitor          # flashen + Konsole (Ctrl+] beendet)
idf.py -p COM9 monitor                # nur Konsole
idf.py menuconfig                     # Menü "Callgreen"
python -m esptool --chip esp32c3 -p COM9 erase-region 0x9000 0x6000   # NVS löschen -> NEU
```
Nach Änderungen an `sdkconfig.defaults`: `sdkconfig` löschen, dann bauen.

### Typische Log-Zeilen

| Situation | Log |
|---|---|
| Start | `--- Callgreen v7.0.0 (HW v3): Aufwachen ---`, `Weckgrund: …` |
| Zustand | `device: Zustand: AKTIV (WLAN-Daten: ja, device_token: abcd... (43 Zeichen))` |
| Zustandswechsel | `device: Zustand: NICHT ZUGEORDNET -> AKTIV (Claim ok)` |
| Modus | `main: Modus: USB + AKTIV -> Messzyklus` |
| Messung | `cycle: Messung seq N: moisture=..% raw=.. (..) temp=.. rh=.. lux=.. bat=..V` |
| Senden | `cycle: POST /readings/batch (N Messungen, Versuch 1)`, `Backend: N von N Messungen bestaetigt` |
| Zeit | `cycle: Zeit per SNTP synchronisiert` |
| 401 | `net: …: 401, device_token abgelehnt`, `401: N gepufferte Messungen verworfen` |
| Online | `online: Online-Modus: USB + AKTIV + WLAN, Befehle alle 10 s …` |
| Befehl | `commands: Befehl c_…: measure_now`, `Ack c_…: ok` |
| Onboarding | `onboarding: BLE-Provisioning gestartet als CALLGREEN-…`, `claim_token empfangen`, `Claim ok, WLAN verbunden: BLE bleibt noch max. 60 s offen …`, `App nicht mehr verbunden, Nachlauf beendet` |
| OTA | `ota: Firmware 7.0.0 aus ota_0, Zustand …`, `Angebot … -> installiere`, `sha256 ok`, `… als gueltig markiert` |
| Heap | `onboarding: Heap Onboarding: frei …, min …, groesster Block …` |

---

## 14. Verlauf (Chronik)

| Datum | Schritt |
|---|---|
| 12.10. | Umstieg Arduino → ESP-IDF v6.1. Minimalprojekt, USB-Wakeup-Problem gelöst (internes Pull-down). Wach-Firmware zum bequemen Flashen. |
| 12.10. | Firmware v6: 1:1-Verhalten von v5 gegenüber dem Backend (18 Readings an `/readings`, `/logs`), neue Pinbelegung, eigene I2C-Treiber, Lademodus, Settle-Test, OTA-Partitionstabelle (ohne OTA-Code). |
| 12.–13.10. | Fixes v6: SNTP-Sync abwarten, IO0-Pull-up, Flags bei Lesefehlern, TLS-Cross-Signed-Fix, HTTP-Keep-Alive, Wiederholregeln. |
| 13.10. | Vertrag v7. Phase A gebaut und getestet. Funde: PoP/Expo, `security1`-Log, zu früher BLE-Stopp, zweites Onboarding, WLAN-Löschen nach Fehler, Claim-Race. v8-Dokument begonnen. |
| 14.10. | Phase B gebaut. Präzisierungen mit Backend (`time_synced`, `buffered_count`, `seq`, `moisture_pct: null`, `config`-Bereiche). Fixes: 401-Erkennung, SNTP-Startverzögerung, Nachlauf direkt nach Claim, `ssid` im `status`. |
| 14.10. | Phase C gebaut (Befehle, Online-Modus, Puffer leeren bei 401). |
| 14.10. | Phase D gebaut (OTA, Rollback, `-Os`, größere Slots, `PROJECT_VER`). Um 13:47 geflasht. |
| 14.10.–22.10. | [unklar] |
