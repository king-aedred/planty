# Planty – Projektbeschreibung für Claude Project

## Produktvision

Planty ist ein IoT-Pflanzensensor der Nutzern per App, Telegram-Nachricht, Sprachnachricht oder Telefonanruf mitteilt, wenn ihre Pflanze Wasser, mehr Licht oder eine andere Temperatur braucht. Die Besonderheit: Die Pflanze kommuniziert mit einer eigenen KI-Persönlichkeit (fröhlich, lustig oder ruppig) und spricht den Nutzer direkt an – z.B. "Hey, ich bin deine Monstera. Ich habe Durst!" Die Zielgruppe sind Botanik-Laien, insbesondere Solo-Männer die vergessen ihre Pflanze zu gießen. Das Produkt soll möglichst plug-and-play sein und über TikTok Shop vermarktet werden. Zielpreis: max. 24,99€ UVP bei ~8-12€ Herstellungskosten in Serie.

---

## Aktueller Hardware-Stand (Prototyp)

### Verbaute Komponenten
- **Mikrocontroller:** D1 Mini Lite (ESP8285 Chip) – WLAN eingebaut, Arduino IDE kompatibel, Micro-USB, CH340 USB-Chip
- **Feuchtigkeitssensor:** Capacitive Soil Moisture Sensor V2.0 – kapazitiv (keine Korrosion), 3-adriges Kabel (Rot=VCC, Schwarz=GND, Gelb=AOUT)
- **Breadboard:** Großes weißes Breadboard
- **Power Module:** Schwarzes Breadboard-Power-Module mit USB-A und Schalter (aktuell nicht in Verwendung)
- **Jumper-Kabel:** Male-Male und Male-Female Kabel
- **Stiftleisten:** Wurden angelötet (erste Lötarbeit erfolgreich abgeschlossen)

### Verkabelung Feuchtigkeitssensor
| Sensorkabel | D1 Mini Pin |
|---|---|
| Rot (VCC) | 3V3 |
| Schwarz (GND) | GND |
| Gelb (AOUT) | A0 |

### Kalibrierungswerte (mit 3.3V)
- **Trocken (Luft):** ~680–750 (Mittelwert: 715)
- **Nass (Wasser):** ~150–200 (Mittelwert: 175)
- **Erde, nicht frisch gegossen:** ~40% Feuchtigkeit

### Noch nicht verbaut (geplant für spätere Phasen)
- DS18B20 Temperatursensor (wasserdicht)
- BH1750 Lichtsensor (I²C)
- 18650 Li-Ion Akku + TP4056 Ladeplatine
- ESP32 (Nachfolger des ESP8285, hat Bluetooth für besseres Onboarding)

---

## Aktueller Software-Stand

### Firmware (D1 Mini)
Aktuell läuft folgender Code auf dem D1 Mini – er mittelt 10 Messungen, rechnet in Prozent um und schickt den Wert per HTTP an den Homeserver:

```cpp
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>

const char* ssid     = "WLAN-NAME";
const char* password = "WLAN-PASSWORT";
const char* serverIP = "http://192.168.X.X:5000/sensor";

int trocken = 715;
int nass = 175;

void setup() {
  Serial.begin(9600);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
}

void loop() {
  int summe = 0;
  for (int i = 0; i < 10; i++) {
    summe += analogRead(A0);
    delay(10);
  }
  int rohwert = summe / 10;
  int prozent = map(rohwert, trocken, nass, 0, 100);
  prozent = constrain(prozent, 0, 100);

  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    String url = String(serverIP) + "?feuchtigkeit=" + String(prozent);
    http.begin(client, url);
    http.GET();
    http.end();
  }

  delay(600000); // 10 Minuten
}
```

**Noch zu implementieren in der Firmware:**
- Eindeutige Geräte-ID mitsenden
- Deep Sleep statt delay() für Akkubetrieb
- OTA-Updates (Over The Air Firmware-Updates)
- Fehlerbehandlung bei WLAN-Ausfall

### Backend (Ubuntu Server)
**Betriebssystem:** Ubuntu Server (Homeserver, immer an)
**Sprache:** Python 3 + Flask
**Installierte Libraries:** flask, twilio, python-telegram-bot

Aktuell laufendes server.py:
```python
from flask import Flask, request
from datetime import datetime
import asyncio
import telegram

app = Flask(__name__)

TELEGRAM_TOKEN = "BOT-TOKEN"
TELEGRAM_CHAT_ID = "CHAT-ID"

async def nachricht_senden(feuchtigkeit):
    bot = telegram.Bot(token=TELEGRAM_TOKEN)
    await bot.send_message(
        chat_id=TELEGRAM_CHAT_ID,
        text=f"🌱 Hallo! Ich bin deine Pflanze und ich habe Durst! Meine Feuchtigkeit beträgt nur noch {feuchtigkeit}%. Bitte gieß mich!"
    )

@app.route('/sensor')
def sensor():
    feuchtigkeit = int(request.args.get('feuchtigkeit', 0))
    zeitstempel = datetime.now().strftime("%H:%M:%S")
    print(f"[{zeitstempel}] Feuchtigkeit: {feuchtigkeit}%")
    if feuchtigkeit < 30:
        asyncio.run(nachricht_senden(feuchtigkeit))
    return "OK", 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

**Dateipfad:** ~/pflanzensensor/server.py
**Starten:** python3 server.py
**Port:** 5000
**Test-URL:** http://SERVER-IP:5000/sensor?feuchtigkeit=10

### Was bereits funktioniert
- ✅ Feuchtigkeitssensor liest stabile Werte aus Erde
- ✅ D1 Mini verbindet sich mit WLAN
- ✅ Sensordaten werden per HTTP an Homeserver geschickt
- ✅ Server empfängt Daten und zeigt sie im Terminal
- ✅ Telegram Bot schickt Nachricht wenn Feuchtigkeit unter 30%
- ✅ Twilio Anruf funktioniert (als Fallback eingerichtet)

---

## Geplanter Tech-Stack (Vollprodukt)

### Hardware
| Komponente | Prototyp | Produkt |
|---|---|---|
| Mikrocontroller | ESP8285 (D1 Mini Lite) | ESP32 (WLAN + Bluetooth) |
| Feuchtigkeit | Capacitive V2.0 | Kapazitiv custom PCB |
| Temperatur | — | DS18B20 |
| Licht | — | BH1750 |
| Strom | USB / Laptop | 18650 Akku + TP4056 |
| Gehäuse | Breadboard | 3D-Druck → später Spritzguss |

### Backend & Infrastruktur
- **n8n** (self-hosted auf Ubuntu Server) – visueller Workflow-Automatisierer, ersetzt Flask-Script, 400+ Integrationen, kostenlos self-hosted
- **Convex** – Datenbank (users, plants, sensors, notifications, settings)
- **Clerk** – Authentifizierung und Nutzerverwaltung
- **Asterisk** – selbst gehostete Telefonanlage auf Ubuntu Server (noch einzurichten)
- **easybell.de** – SIP-Trunk Anbieter für ausgehende Anrufe (~0.001€/min), skalierbar mit Channels
- **ElevenLabs** – KI-Stimme, generiert MP3 on-the-fly (kostenloser Tier für Prototyp)

### Kommunikationsarten (geplant, nach Nutzereinstellung)
1. Telegram Textnachricht (kostenlos, bereits funktioniert)
2. Telegram Sprachnachricht mit KI-Stimme (ElevenLabs + Telegram Bot)
3. Echter Telefonanruf mit KI-Stimme (Asterisk + easybell + ElevenLabs)

### Frontend / App
- Web-App (React, vermutlich Next.js)
- Pflanze anlegen, benennen, Pflanzenart wählen
- Kontaktzeitfenster einstellen (z.B. nur 9–21 Uhr)
- Benachrichtigungsart wählen
- KI-Charakter wählen (fröhlich / lustig / ruppig)
- Dev-Modus: Fake-Sensordaten einspeisen, Reaktionen sofort testen

### Datenbank-Schema (Convex, geplant)
- **users** – id, clerk_id, name, email, phone, notification_preference, contact_window_start, contact_window_end
- **plants** – id, user_id, name, species, character, sensor_id
- **sensors** – id, device_id, user_id, last_seen, firmware_version
- **readings** – id, sensor_id, moisture, temperature, light, timestamp
- **notifications** – id, plant_id, type, sent_at, triggered_by

---

## KI-Charaktere

Drei Persönlichkeiten, jede spricht anders:

| Charakter | Stil | Beispiel |
|---|---|---|
| Fröhlich | Warm, liebevoll, optimistisch | "Hallo Schatz! Ich bin deine Monstera und ich hab ein bisschen Durst bekommen!" |
| Lustig | Witzig, übertrieben dramatisch | "HILFE! Ich verdurste! Jemand... bitte... ein Schluck Wasser... es ist zu spät... oder vielleicht doch nicht, wenn du JETZT gießt!" |
| Ruppig | Direkt, unverblümt, genervt | "Ey. Wasser. Jetzt. Bin bei 20%. Mach hinne." |

Technisch: ElevenLabs generiert aus einem Template-Text eine MP3 mit der gewählten Stimme. Später können Nutzer über ein Abo Premium-Stimmen freischalten.

---

## Onboarding-Flow (geplant)

### Aktuell (Prototyp)
WLAN-Name und Passwort direkt im Code hardcoded.

### Kurzfristig (Access Point Modus)
1. Sensor einstecken → macht kurz eigenes WLAN auf ("Planty-Setup")
2. App verbindet sich automatisch damit
3. App zeigt verfügbare WLANs → Nutzer wählt seins
4. Einmal Passwort eingeben → Sensor verbindet sich
5. Pflanze anlegen in der App

### Langfristig (ESP32 mit Bluetooth)
1. Sensor einstecken
2. App erkennt Sensor automatisch per Bluetooth
3. App schickt WLAN-Name + Passwort direkt vom Handy
4. Kein Passwort-Eintippen nötig – echtes Plug and Play

---

## Wichtige technische Details & Learnings

### Sensor
- Kapazitiver Sensor misst die Dielektrizitätskonstante der Erde – kein Stromfluss durch die Erde, daher keine Korrosion
- Sensor braucht 5–10 Minuten "Einschwingzeit" wenn er neu in Erde gesteckt wird
- Kalibrierung ist spannungsabhängig – bei 3.3V andere Werte als bei 5V, immer bei einer Spannung bleiben
- Verschiedene Erden (Kaktuserde, Anzuchterde, Universalerde) haben unterschiedliche Messwerte – spätere Kalibrierung pro Erdentyp geplant
- Unrealistische Werte (unter 100 oder über 900) werden gefiltert

### Firmware
- ESP8285 = ESP8266 mit integriertem Flash, kompatibel mit esp8266 Arduino-Paket
- Board in Arduino IDE: LOLIN(WEMOS) D1 mini Lite
- Upload Speed: 115200 (stabiler als höhere Werte)
- Port: COM9 (Windows, kann variieren)
- Deep Sleep ist kritisch für Akkubetrieb – delay() hält den Chip wach und leert den Akku in Tagen

### Akkulaufzeit (geplant mit Deep Sleep)
| Messintervall | Laufzeit (3000mAh) |
|---|---|
| alle 5 Minuten | 2–3 Wochen |
| alle 15 Minuten | 6–10 Wochen |
| alle 30 Minuten | 3–5 Monate |

### Skalierung & Kosten
- Twilio: ~2 Cent/Anruf → bei 1000 Nutzern/Tag = 20€/Tag = 600€/Monat (nicht skalierbar)
- Asterisk + easybell: ~0.001 Cent/Minute, SIP Channels parallelisierbar → viel günstiger
- n8n self-hosted: kostenlos, unbegrenzte Workflows und Ausführungen
- ElevenLabs: kostenloser Tier für Prototyp, später ggf. Abo

---

## Roadmap Planty V1.0

### Phase 1 – Solider Sensor (Wochen 1–3)
- [ ] Feuchtigkeitssensor stabil kalibriert, Sprünge gefiltert
- [ ] Eindeutige Geräte-ID implementiert
- [ ] Wiederholungsschutz: max. 1 Kontakt pro Tag
- [ ] Deep Sleep eingebaut
- [ ] Auf Akku umgestellt (TP4056 + 18650)
- [ ] Akkulaufzeit getestet (Ziel: mind. 4 Wochen)

### Phase 2 – Backend & Kommunikation (Wochen 3–6)
- [ ] n8n installiert und läuft (ersetzt Flask-Script)
- [ ] Asterisk + easybell verbunden (ausgehende Anrufe)
- [ ] ElevenLabs angebunden (KI-Stimme als MP3)
- [ ] 3 Charaktere eingerichtet (fröhlich, lustig, ruppig)
- [ ] Zeitfenster-Logik (Anrufe nur zu eingestellten Zeiten)
- [ ] Fehlerbehandlung bei WLAN-Ausfall

### Phase 3 – Datenbank & Auth (Wochen 5–8)
- [ ] Convex Datenbank aufgesetzt
- [ ] Clerk Auth integriert
- [ ] Sensor mit Nutzerkonto verknüpft
- [ ] Pflanzendatenbank angebunden (OpenFarm API)

### Phase 4 – App & Interface (Wochen 7–10)
- [ ] Erstes Web-Interface live
- [ ] Kontaktzeitfenster einstellbar
- [ ] Benachrichtigungsart wählbar
- [ ] Dev-Modus gebaut
- [ ] Onboarding-Flow (Access Point Modus)

### Phase 5 – Sensor-Erweiterung (Wochen 10–14)
- [ ] DS18B20 Temperatursensor integriert
- [ ] BH1750 Lichtsensor integriert
- [ ] 3-dimensionale Auswertungslogik (Durst, Temperatur, Licht)
- [ ] Pflanzenspezifische Grenzwerte
- [ ] Nachrichten für alle 3 Dimensionen

### Phase 6 – Beta-Bereitschaft (Wochen 12–16)
- [ ] OTA-Updates implementiert
- [ ] Gehäuse-Prototyp gebaut (3D-Druck)
- [ ] ESP32 mit Bluetooth-Onboarding getestet
- [ ] 5 Beta-Nutzer onboarded
- [ ] TikTok-Content gestartet

---

## Offene nächste Schritte

1. **Asterisk + easybell einrichten** – SIP Trunk für ausgehende Anrufe
2. **n8n installieren** – node.js + npm install -g n8n, läuft auf Port 5678
3. **Deep Sleep in Firmware** – ESP.deepSleep(interval) statt delay()
4. **Akku anschließen** – TP4056 Ladeplatine + 18650 Zelle
5. **Geräte-ID** – ESP.getChipId() als eindeutige ID mitsenden

---

## Vermarktungsstrategie

- **Kanal:** TikTok Shop (primär), später Amazon
- **Content-Idee:** Pflanze ruft dramatisch an und sagt sie stirbt – viral-fähig
- **Zielpreis:** 24,99€ Einmalpreis + optional 1,99€/Monat für Premium-Stimmen
- **Zielgruppe:** Botanik-Laien, Solo-Männer 20–35, Leute die vergessen zu gießen
- **USP:** KI-Persönlichkeit + Anruf-Feature – gibt es so nicht auf dem Markt
- **Markt:** Xiaomi Flower Care, Parrot Pot – aber keine mit KI-Charakter oder Anruffunktion

---

## Serverdetails (Homeserver)

- **OS:** Ubuntu Server
- **Python:** Python 3 + pip3
- **Flask:** installiert
- **Telegram Bot:** installiert (python-telegram-bot)
- **Twilio:** installiert
- **Arbeitsverzeichnis:** ~/pflanzensensor/
- **Server starten:** python3 server.py
- **n8n:** noch zu installieren (Port 5678)
- **Asterisk:** installiert, noch nicht mit easybell verbunden
