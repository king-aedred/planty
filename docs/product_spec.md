# Planty – Product Spec Beta

**Version:** 0.1 · **Stand:** 2026-06-29
**Beta-Ziel:** 10 Tester · einige mit 1 Sensor, einige mit 2
**Zielgruppe Produkt:** Botanik-Laien, Solo-Männer 20–35
**Zielpreis:** 24,99 € Einmalpreis + optional 2,99 €/Monat Premium

---

## Überblick

Planty ist ein IoT-Pflanzensensor, der Nutzern per App, Telegram, Sprachnachricht oder Telefonanruf mitteilt, wenn ihre Pflanze Wasser, mehr Licht oder eine andere Temperatur braucht. Die Pflanze kommuniziert mit einer eigenen KI-Persönlichkeit.

---

## Beta-Strategie

Ziel der Beta ist Lernen, nicht Verkaufen.

- 10 Tester erhalten Hardware kostenlos oder stark vergünstigt
- Gegenleistung: ehrliches strukturiertes Feedback
- Tester müssen das Produkt wirklich aktiv benutzen
- Alle Premium Features für Beta-Tester freigeschaltet
  (kein Paywall-Enforcement)
- TikTok Content Möglichkeit: "Ich gebe mein Produkt
  10 Menschen – was passiert?"

Hardware-Kosten Beta (10 Stück, Selbstmontage):
- Materialkosten gesamt: ~125 € (~12,50 €/Stück)
- Aktive Montagezeit: ~40–50 Min/Stück
- Gehäuse: 3D Druck (Lochrasterplatine, kein PCB nötig)
- Ziel: nicht profitabel, sondern Feedback generieren

---

## 1. Onboarding

| Feature | Beta Must-Have | Priorität | Testbar | Wie testen |
|---|---|---|---|---|
| Account erstellen + Email-Bestätigung | Ja | P0 | Manuell | Registrierung durchlaufen, Bestätigungsmail prüfen |
| Bluetooth Sensor-Pairing in der App (ESP32) | Ja | P0 | Hardware | Echter Sensor in Reichweite, Pairing-Flow in App durchlaufen |
| Sensor einstecken → Pflanze aus DB wählen | Ja | P0 | Hardware | Nach Pairing Pflanze aus Liste auswählen, Daten erscheinen in App |
| Pflanzenspezifische Default-Schwellenwerte automatisch gesetzt | Ja | P1 | Automatisch | Dev Mode: Pflanze anlegen, Schwellenwerte ohne manuelle Eingabe prüfen |
| Schwellenwerte individuell anpassen (Feuchtigkeit, Licht, Temp) | Ja | P1 | Manuell | Werte in Einstellungen ändern, Änderung in Convex verifizieren |
| Messzeit konfigurierbar (z.B. täglich 08:00) | Ja | P1 | Automatisch | Dev Mode: Messzeit setzen, nächste Messung zum richtigen Zeitpunkt abwarten |
| Hinweis bei erster Inbetriebnahme: "Erste Messung dauert bis zu 3 Min" | Nein | P2 | Manuell | Onboarding durchlaufen, Hinweis-Screen prüfen |
| Manueller Mess-Trigger für sofortige erste Messung | Ja | P1 | Hardware | Button in App drücken, Sensor-Response innerhalb 3 Min beobachten |

**Kritische Anmerkungen:**
- Bluetooth Pairing (P0) ist ein echter Beta-Blocker: ohne funktionierendes Pairing kommen Tester nie ins System.
- Der Hinweis "3 Min Wartezeit" ist UX-Polish – für Beta unwichtig, spart aber Support-Anfragen.

---

## 2. Sensor-Logik

| Feature | Beta Must-Have | Priorität | Testbar | Wie testen |
|---|---|---|---|---|
| Tägliche Messung zur konfigurierten Zeit (18 Readings über 3 Min) | Ja | P0 | Hardware | Messzeit auf nächste Minute setzen, Readings in Convex prüfen |
| Manueller Mess-Trigger aus der App | Ja | P1 | Hardware | Trigger-Button drücken, Messung und Convex-Eintrag verifizieren |
| Sensor lädt beim Wakeup aktuelle Konfiguration von Convex | Ja | P0 | Hardware | Konfiguration in App ändern, nach nächstem Wakeup prüfen ob Sensor neue Config verwendet |
| Retry-Logik bei Fehlschlag: 3x alle 5 Min | Ja | P1 | Automatisch | Dev Mode: Convex-Verbindung simuliert unterbrechen, Retry-Logs prüfen |
| Nach 3 Fehlschlägen → User benachrichtigen "Sensor Problem" | Ja | P1 | Automatisch | Dev Mode: Fehler-Flag setzen, Notification prüfen |
| Follow-Up Messung 30 Min nach Benachrichtigung | Nein | P2 | Automatisch | Dev Mode: Zeitstempel vortäuschen, Follow-Up Messung triggern und Response prüfen |
| Danke-Nachricht bei Verbesserung erkannt | Nein | P2 | Automatisch | Dev Mode: Werte über Schwellenwert setzen, Danke-Flow prüfen |
| Eskalationslogik: nach 3 Tagen ohne Verbesserung → dramatischer Ton | Nein | P2 | Automatisch | Dev Mode: Zeitstempel 3 Tage vordatieren, Ton der Nachricht vergleichen |
| Wakeup-Logik: Timer Wakeup (normale Messung) | Ja | P0 | Hardware | Sensor schläft, wacht zur Messzeit auf, Messung startet |
| Wakeup-Logik: EXT0 Wakeup (CHRG Pin LOW → Laden erkannt) | Ja | P1 | Hardware | USB einstecken, Sensor erkennt Ladevorgang und wechselt Betriebsmodus |
| esp_sleep_get_wakeup_cause() → Timer vs CHRG unterscheiden | Ja | P1 | Hardware | Beide Wakeup-Szenarien ausführen, Firmware-Logs prüfen |

**Kritische Anmerkungen:**
- Follow-Up Messung und Eskalationslogik sind für 10 Beta-Tester kaum erlebbar (3 Tage Wartezeit). Dev Mode Simulation ist hier der einzig praktikable Testweg.
- Wakeup-Logik ist hardware-seitig kritisch: falsche RTC GPIO Zuweisung kann EXT0 Wakeup komplett lahmlegen.

### Follow-Up Flow (detailliert)

Tägliche Messung → Wert critical →

Benachrichtigung an User (gewählter Kanal) →

30 Min später: Sensor wacht auf (zweiter Timer) →

Einzelmessung (nicht 18 Readings, nur 1 schneller Check) →

Wenn Verbesserung erkannt:
- → Danke-Nachricht im gewählten Kanal
- → Eskalationszähler zurücksetzen

Wenn keine Verbesserung:
- → Keine weitere Meldung heute
- → Eskalationszähler +1

Wenn Eskalationszähler >= 3:
- → Nachrichtenton wird dramatischer
- → Häufigere Kontaktversuche
- → Bei Verbesserung: Zähler zurücksetzen

Energiebilanz Follow-Up:
- Zweiter Wakeup kostet ~30 Sek aktiv
- Vernachlässigbar für Akkulaufzeit
- Sensor kennt Follow-Up Zeit von Anfang an
  (Messzeit + 30 Min = hardcoded, kein Polling)

### Wakeup-Logik (vollständiger Flow)

**Wakeup 1** (nach Einschalten/Reset):
- → NTP Zeit holen
- → Wie lange bis Messzeit? → schlafe genau diese Sekunden

**Wakeup 2** (Messzeit, z.B. 08:00):
- → 18 Readings über 3 Min
- → Konfiguration von Convex laden (neue Messzeit? manueller Trigger?)
- → Akkustand messen + senden
- → Wakeup Cause: Timer → schlafen bis Follow-Up Zeit

**Wakeup 3** (Follow-Up, z.B. 08:35):
- → Einzelmessung
- → Verbesserung? → Danke Nachricht
- → Wakeup Cause: Timer → schlafen bis nächste Messzeit

**Wakeup 4** (CHRG Pin, jederzeit):
- → Wakeup Cause: EXT0
- → NICHT schlafen
- → Lademodus: alle 60 Sek Akkustand senden
- → OTA Update falls verfügbar
- → STDBY Signal → "voll geladen" senden → Push Notification
- → Schlafen bis nächste Messzeit

Konfigurationsänderungen:
- Sensor lädt bei jedem Wakeup aktuelle Config von Convex
- Neue Messzeit gilt ab nächstem Wakeup
- Manueller Trigger wird als Flag in Convex gesetzt
- Sensor prüft Flag → führt sofortige Messung durch

---

## 3. Akku-Management

**Hardware-Voraussetzungen:**
- CHRG und STDBY Pins müssen auf RTC GPIO Pins gelegt werden (ESP32: GPIO 0, 2, 4, 12–15, 25–27, 32–39).
- Spannungsmessung über ADC + Spannungsteiler muss im PCB-Design korrekt dimensioniert sein.
- Bis das finale PCB existiert, sind viele Akku-Features **nicht simulierbar**.

| Feature | Beta Must-Have | Priorität | Testbar | Wie testen |
|---|---|---|---|---|
| Spannungsmessung via ADC + Spannungsteiler → Akkustand in % | Ja | P0 | Hardware | ADC-Wert im Firmware-Log prüfen, mit Multimeter-Messung vergleichen |
| Li-Ion Spannungskurve korrekt abgebildet (4.2V=100% … 3.0V=0%) | Ja | P1 | Hardware | Akku bei bekanntem Ladestand messen, Prozentwert in App prüfen |
| Akkustand wird bei jeder Tagesmessung an Convex gesendet | Ja | P1 | Hardware | Tagesmessung abwarten, Akkufeld in Convex-DB prüfen |
| App zeigt Akkustand im Status Screen | Ja | P1 | Hardware | Akkustand in App mit tatsächlichem Wert vergleichen |
| Unter 15% → Push Notification "Bitte Sensor laden" | Nein | P2 | Automatisch | Dev Mode: Akkustand-Flag auf 14% setzen, Notification prüfen |
| CHRG Wakeup → nicht schlafen, alle 60 Sek Akkustand senden | Ja | P1 | Hardware | USB einstecken, Convex alle 60 Sek auf neuen Akkustand-Eintrag prüfen |
| App zeigt Live-Ladefortschritt (🔋 Lädt… 45% → 46% → 47%) | Nein | P2 | Hardware | Ladevorgang starten, App-Anzeige in Echtzeit beobachten |
| STDBY Pin LOW → Akku voll → 100% senden | Ja | P1 | Hardware | Akku vollständig laden, STDBY-Signal und Convex-Eintrag prüfen |
| Push Notification "Sensor voll geladen, bitte wieder einstecken" | Nein | P2 | Hardware | Vollladung abwarten, Notification prüfen |
| Sensor schläft nach Vollladung bis nächste Messzeit | Ja | P1 | Hardware | Nach STDBY Signal prüfen ob Sensor in Deep Sleep wechselt |
| OTA Update während Ladevorgang einspielen | Nein | P2 | Nicht simulierbar | Neue Firmware bereitstellen, Sensor laden, Firmware-Version nach Laden prüfen |
| Notabschaltung bei 3.0V (0%) | Ja | P1 | Nicht simulierbar | Akku vollständig entladen – kein Beta-Test empfohlen, Risikotest |

**Kritische Anmerkungen:**
- Live-Ladefortschritt ist UX-Feature, kein technisches Muss für Beta.
- Die Notabschaltung sollte im Firmware-Code verankert sein, aber für Beta-Tester **nicht** provoziert werden (Akku-Schaden).
- OTA während Laden setzt stabile Hardware und Firmware-Infrastruktur voraus – realistisch Post-Beta.

---

## 4. Benachrichtigungen

| Feature | Beta Must-Have | Priorität | Testbar | Wie testen |
|---|---|---|---|---|
| Push Notification (Expo Push Notifications) | Ja | P0 | Automatisch | Dev Mode: Benachrichtigung triggern, Gerät empfängt Push |
| In-App Nachricht (interner Messenger) | Ja | P1 | Manuell | Messung durchführen, Nachricht in App-Postfach prüfen |
| Telegram Text-Nachricht (Bot API) | Ja | P1 | Manuell | Telegram-Bot verknüpfen, Messung durchführen, Nachricht im Chat prüfen |
| WhatsApp (Twilio Sandbox, Beta) | Nein | P2 | Manuell | Twilio Sandbox einrichten, Testnachricht senden und empfangen |
| WhatsApp (Production Business API) | Nein | P3 | Manuell | Erfordert Meta-Genehmigung – kein Beta-Scope |
| Telefonanruf mit KI-Stimme (Asterisk + easybell + ElevenLabs) | Nein | P3 | Nicht simulierbar | Komplexe Infrastruktur – kein Beta-Scope |
| Sprachnachricht via Telegram (ElevenLabs MP3) | Nein | P2 | Manuell | ElevenLabs MP3 generieren, via Telegram-Bot als Voice-Message senden |
| Sprachnachricht via WhatsApp (ElevenLabs MP3) | Nein | P3 | Manuell | Abhängig von WhatsApp Business API – kein Beta-Scope |
| Benachrichtigungskanal wählbar (einer oder mehrere) | Ja | P1 | Manuell | Kanal in Einstellungen wechseln, Nachricht kommt nur im gewählten Kanal an |
| Frequenz wählbar (critical / täglich / individuell) | Nein | P2 | Manuell | Frequenz einstellen, über mehrere Tage beobachten |
| Kontaktzeitfenster einstellbar (z.B. 09:00–21:00) | Nein | P2 | Automatisch | Dev Mode: Zeitfenster auf nächste Minute setzen, Nachricht innerhalb/außerhalb prüfen |
| Eskalationslogik Tag 1 normal → Tag 2 dringlicher → Tag 3+ dramatisch | Nein | P2 | Automatisch | Dev Mode: Zeitstempel vordatieren, Nachrichtenton vergleichen |
| KI-Persönlichkeit: 3 Charaktere (fröhlich / genervt / neutral) | Nein | P2 | Manuell | Charakter wechseln, Nachrichtentext auf Tonalität prüfen |
| KI-Charakter pro Pflanze einstellbar | Nein | P2 | Manuell | Zwei Pflanzen mit unterschiedlichem Charakter anlegen, beide Nachrichten vergleichen |
| ElevenLabs Stimme für Anruf und Sprachnachricht | Nein | P3 | Manuell | Kein Beta-Scope (abhängig von Telefonanruf-Infrastruktur) |

**Kritische Anmerkungen:**
- Telefonanruf (Asterisk + easybell + ElevenLabs) ist die technisch aufwändigste Feature-Kombination im gesamten Produkt. Für 10 Beta-Tester ist das unverhältnismäßig. Post-Beta.
- WhatsApp Production API erfordert Meta-Genehmigung und ist nicht für Beta realistisch. Twilio Sandbox als P2 möglich, aber kein Must-Have.
- Sprachnachrichten via Telegram sind technisch einfacher und könnten als Beta-Differenziator dienen (P2).
- KI-Persönlichkeiten sind ein starkes Produkt-Merkmal, aber für die Kernfunktion (Pflanze warnt) nicht notwendig. Beta kann mit neutralem Ton starten.

---

## 5. Multi-Plant Management

| Feature | Beta Must-Have | Priorität | Testbar | Wie testen |
|---|---|---|---|---|
| Mehrere Pflanzen pro Account | Ja | P1 | Manuell | Zweite Pflanze anlegen, beide im Status Screen sichtbar |
| Mehrere Sensoren pro Account | Ja | P1 | Hardware | Zweiten Sensor pairen, beide Sensoren aktiv und messend |
| Sensor zwischen Pflanzen ummelden | Ja | P1 | Hardware | Sensor von Pflanze A zu Pflanze B übertragen, Pflanze A ohne Sensor weiterhin in App |
| Quellpflanze beim Transfer behalten (ohne Sensor) | Ja | P1 | Manuell | Nach Transfer: Pflanze A noch vorhanden, kein Sensor zugewiesen |
| Quellpflanze beim Transfer löschen (mit Warndialog) | Ja | P1 | Manuell | Löschen wählen, Warndialog erscheint, Pflanze nach Bestätigung entfernt |
| Warnung: historische Daten gehen beim Löschen verloren | Ja | P1 | Manuell | Warndialog-Text prüfen, nach Löschen keine historischen Daten für Pflanze A |
| Sensor-Transfer überträgt keine historischen Daten | Ja | P1 | Manuell | Nach Transfer prüfen: neue Pflanze hat keine alten Messwerte |
| Pflanze ohne Sensor anlegen | Nein | P2 | Manuell | Pflanze anlegen ohne Sensor zu pairen, erscheint in Liste als "kein Sensor" |

**Kritische Anmerkungen:**
- Multi-Sensor ist Beta-relevant weil einige Tester 2 Sensoren haben. P1 ist korrekt.
- Pflanze ohne Sensor ist für Beta-Tester wenig nützlich (sie haben Sensoren). P2.

---

## 6. Pflanzendatenbank

| Feature | Beta Must-Have | Priorität | Testbar | Wie testen |
|---|---|---|---|---|
| Pflanze aus vorhandener Liste wählen (OpenFarm API oder eigene DB) | Ja | P1 | Manuell | Pflanzennamen suchen und auswählen, Daten korrekt übernommen |
| Pflanzenspezifische Default-Schwellenwerte (Feuchtigkeit, Temp, Licht) | Ja | P1 | Automatisch | Pflanze wählen, Schwellenwerte mit bekannten Referenzwerten vergleichen |
| Manuell eigene Pflanze anlegen falls nicht in Liste | Ja | P1 | Manuell | Pflanzennamen eingeben der nicht in DB ist, anlegen, Schwellenwerte manuell setzen |
| Schwellenwerte individuell überschreibbar pro Pflanze | Ja | P1 | Manuell | Default-Wert ändern, neuer Wert wird für Schwellenwert-Prüfung verwendet |

**Kritische Anmerkungen:**
- Entscheidung zwischen OpenFarm API und eigener DB muss vor Beta getroffen werden. OpenFarm hat unzuverlässige Datenlage für Sensorschwellenwerte – eigene kuratierte Mini-DB (50–100 Pflanzen) ist für Beta stabiler.

---

## 7. Status Screen

| Feature | Beta Must-Have | Priorität | Testbar | Wie testen |
|---|---|---|---|---|
| Aktueller Status pro Pflanze (Feuchtigkeit, Temperatur, Licht) | Ja | P0 | Automatisch | Dev Mode: Messwerte injizieren, alle drei Dimensionen im Screen prüfen |
| Median-Wert + State Badge pro Dimension (ok / warning / critical) | Ja | P1 | Automatisch | Dev Mode: Werte unter/über Schwellenwert setzen, Badge-Farbe prüfen |
| Letztes Update mit exaktem Datum und Uhrzeit | Ja | P1 | Automatisch | Nach Messung: Zeitstempel im Status Screen mit Convex-Eintrag vergleichen |
| Sensor-Status: aktiv / offline / lädt / voll geladen | Ja | P1 | Hardware | Sensor in allen vier Zuständen betreiben, Status-Anzeige prüfen |
| Akkustand in % mit Live-Update beim Laden | Nein | P2 | Hardware | Ladevorgang starten, Prozentzahl in App steigt an |
| Historischer Verlauf (Tageswerte, Trend) | Nein | P2 | Automatisch | Dev Mode: mehrere Tagesmessungen injizieren, Verlaufsdiagramm prüfen |
| Pflanzenliste mit Schnellübersicht aller Pflanzen | Ja | P1 | Manuell | Mehrere Pflanzen anlegen, Liste zeigt alle mit Status-Kurzinfo |

**Kritische Anmerkungen:**
- Historischer Verlauf ist für Beta-Tester erst nach mehreren Betriebstagen erlebbar. Dev Mode Simulation ist der einzig praktikable Testweg.
- Live-Ladefortschritt ist UX-Detail, kein Beta-Blocker.

---

## 8. Einstellungen

| Feature | Beta Must-Have | Priorität | Testbar | Wie testen |
|---|---|---|---|---|
| Benachrichtigungskanal wählen | Ja | P1 | Manuell | Kanal wechseln, Testnachricht kommt im neuen Kanal an |
| Kontaktzeitfenster einstellen | Nein | P2 | Manuell | Zeitfenster setzen, Nachrichten außerhalb des Fensters werden verzögert |
| Schwellenwerte pro Pflanze anpassen | Ja | P1 | Manuell | Wert ändern, nächste Messung löst bei neuem Schwellenwert aus |
| Messzeit konfigurieren | Ja | P1 | Hardware | Neue Messzeit setzen, Sensor misst zur richtigen Zeit |
| Telefonnummer hinterlegen (für Anruf-Feature) | Nein | P3 | Manuell | Kein Beta-Scope (Telefonanruf ist P3) |
| KI-Charakter pro Pflanze wählen | Nein | P2 | Manuell | Charakter wähseln, nächste Nachricht im gewählten Ton prüfen |
| Account verwalten (Email, Passwort ändern) | Nein | P2 | Manuell | Email/Passwort ändern, Login mit neuen Daten prüfen |
| Logout | Ja | P0 | Manuell | Logout-Button, App zeigt Login-Screen, Session ungültig |

---

## 9. Premium Modell

**Hinweis:** Für 10 Beta-Tester ist Paywall-Enforcement nicht sinnvoll. Alle Beta-Tester erhalten vollen Zugang. Das Pricing-Modell wird vor Launch implementiert.

| Feature | Beta Must-Have | Priorität | Testbar | Wie testen |
|---|---|---|---|---|
| Basic: Push Notification | Ja | P0 | Automatisch | Wird in Abschnitt 4 getestet |
| Basic: In-App Nachricht | Ja | P1 | Manuell | Wird in Abschnitt 4 getestet |
| Basic: Telegram Text | Ja | P1 | Manuell | Wird in Abschnitt 4 getestet |
| Basic: 1 Pflanze / 1 Sensor Limit | Nein | P3 | Manuell | Post-Beta: zweite Pflanze anlegen → Paywall erscheint |
| Pro: WhatsApp Nachrichten | Nein | P3 | Manuell | Abhängig von WhatsApp Business API |
| Pro: Sprachnachrichten (ElevenLabs) | Nein | P3 | Manuell | Post-Beta |
| Pro: Telefonanruf | Nein | P3 | Nicht simulierbar | Post-Beta |
| Pro: Bis zu 5 Pflanzen / 5 Sensoren | Nein | P3 | Manuell | Post-Beta: Limit-Enforcement implementieren |
| Pro: Individuelle Schwellenwerte pro Pflanze | Ja | P1 | Manuell | In Beta für alle Tester verfügbar (kein Paywall-Gate) |
| Pro: Historischer Verlauf 30 Tage | Nein | P2 | Automatisch | Dev Mode: Daten injizieren, Verlauf prüfen |
| Pro: Premium KI-Stimmen (ElevenLabs) | Nein | P3 | Manuell | Post-Beta |
| Stripe-Integration / Subscription-Management | Nein | P3 | Manuell | Post-Beta |

**Kritische Anmerkungen:**
- Paywall-Enforcement für Beta bringt keinen Mehrwert und erhöht Entwicklungsaufwand. Empfehlung: alle Features für Beta-Tester freischalten, Pricing-Modell technisch vorbereiten aber nicht enforced.

### Preisstruktur

- **Hardware:** 24,99 € Einmalpreis
- **Premium Monatlich:** 2,99 €/Monat
- **Premium Jährlich:** 24,99 €/Jahr
  (entspricht 2,08 €/Monat, Tester spart ~11 €)
- **Psychologischer Anker:** Jahresabo kostet gleich viel wie Hardware

---

## 10. OTA Firmware Updates

| Feature | Beta Must-Have | Priorität | Testbar | Wie testen |
|---|---|---|---|---|
| Firmware Updates werden während des Ladevorgangs eingespielt | Nein | P2 | Nicht simulierbar | Neue Firmware bereitstellen, Sensor aufladen, Firmware-Version in Convex nach Laden prüfen |
| User bekommt Notification "Sensor wurde aktualisiert" | Nein | P2 | Automatisch | Nach OTA: Push Notification empfangen, Versionsnummer in App aktualisiert |
| Kein manuelles Eingreifen nötig | Nein | P2 | Nicht simulierbar | Gesamter OTA-Flow ohne User-Aktion durchlaufen |
| Versionsnummer in Convex gespeichert und im Status Screen angezeigt | Nein | P2 | Hardware | Firmware-Version in Convex-Feld prüfen, App zeigt gleiche Version |
| Rollback bei fehlgeschlagenem OTA | Nein | P3 | Nicht simulierbar | Bewusst fehlerhafte Firmware einspielen, Sensor fällt auf letzte Version zurück |

**Kritische Anmerkungen:**
- OTA ist für Beta-Tester wichtig als **Wartungskanal** – Bugs können remote gefixt werden ohne Sensor einzusammeln. Sollte technisch vorbereitet sein, auch wenn Tester es nicht aktiv erleben.
- Rollback-Logik ist Post-Beta. Für Beta reicht: OTA klappt → gut. OTA schlägt fehl → Sensor manuell flashen.
- OTA während Ladevorgang ist die einzige sinnvolle Möglichkeit (Sensor hat Strom, keine Unterbrechung des Normalbetriebs).

---

## 11. Hardware Roadmap

| Phase | Stückzahl | Methode | Gehäuse | Kosten/Stück |
|---|---|---|---|---|
| Prototyp (aktuell) | 1 | Breadboard | keins | – |
| Beta | 10 | Lochrasterplatine, Handbestückung | 3D Druck | ~12,50 € |
| Phase 2 | 500 | JLCPCB SMT Assembly | 3D Druck | ~8–10 € |
| Phase 3 | 1000+ | Vollständige Lohnfertigung | Spritzguss | ~4–6 € |

PCB Design:
- Tool: EasyEDA (kostenlos, direkt JLCPCB Integration)
- Lieferant Beta+: JLCPCB (jlcpcb.com)
- PCB Design nötig ab Phase 2 (500 Stück)
- Für Beta reicht Lochrasterplatine

Spritzguss:
- Lohnt sich ab ~500 Stück (Formkosten ~500–2.000 € einmalig)
- Kosten danach: ~0,50–1,50 €/Gehäuse
- Anbieter Phase 3: Seeed Studio Fusion, MacroFab

Wichtige Hardware-Entscheidungen vor Beta:
- ESP32 statt ESP8285 (EXT0 Wakeup, Bluetooth)
- CHRG + STDBY Pins auf RTC GPIO legen
- Spannungsteiler für ADC korrekt dimensionieren

---

## 12. Business Model

### Preisstruktur

- **Hardware:** 24,99 € Einmalpreis
- **Premium Monatlich:** 2,99 €/Monat
- **Premium Jährlich:** 24,99 €/Jahr

### Marge bei Selbstmontage (10 Stück Beta)

- Materialkosten: ~12,50 €/Stück
- Verkaufspreis: 24,99 €
- Nach Versand/Fees: ~7–9 € Rohertrag/Stück
- Montagezeit: ~45 Min/Stück → ~9–10 €/Stunde

### Marge bei Lohnfertigung (1000 Stück)

- Materialkosten: ~8 €/Stück
- Verkaufspreis: 24,99 €
- Nach Versand/Fees: ~8–9 € Gewinn/Stück
- Keine eigene Montagezeit

### Abo-Rechnung (Skalierung)

- 100 Nutzer × 2,99 €/Monat = 299 €/Monat
- 500 Nutzer × 2,99 €/Monat = 1.495 €/Monat
- 1.000 Nutzer × 2,99 €/Monat = 2.990 €/Monat

### Vertriebskanäle

- Primär: TikTok Shop (virale Content-Strategie)
- Sekundär: Amazon (später)
- Provision TikTok Shop: ~5 %
- Provision Amazon: ~15 %

### Wettbewerb

- Xiaomi Flower Care: ~15 €, nur Datenanzeige, keine KI
- Parrot Pot: ~60 €, automatisches Gießen, keine KI
- Planty USP: KI-Persönlichkeit + Anruf-Feature

---

## Zusammenfassung: Beta Must-Have vs. Post-Beta

### Beta Must-Have (P0 + P1)

- Kompletter Onboarding-Flow inkl. Bluetooth Pairing
- Tägliche Messung + manueller Trigger
- Convex-Konfiguration beim Wakeup laden
- Retry-Logik bei Sensor-Fehlschlag
- Akkustand messen und anzeigen
- Ladevorgang erkennen (CHRG Wakeup)
- Push Notification + In-App Nachricht + Telegram
- Multi-Plant und Multi-Sensor Grundfunktion
- Sensor-Transfer zwischen Pflanzen
- Status Screen mit Echtzeit-Daten und State Badges
- Pflanzendatenbank + manuelle Eingabe
- Schwellenwerte anpassen + Messzeit konfigurieren
- Logout

### Post-Beta (P3)

- Telefonanruf (Asterisk + easybell + ElevenLabs)
- WhatsApp Production Business API
- Premium Paywall / Stripe-Integration
- OTA Rollback
- Telefonnummer-Einstellung
- ElevenLabs Stimmen für Anruf

### Risiken

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|---|---|---|---|
| PCB RTC GPIO falsch verdrahtet → EXT0 Wakeup defekt | Mittel | Hoch | Hardware-Review vor PCB-Produktion |
| Bluetooth Pairing instabil bei ESP32 + Expo | Hoch | Hoch | Frühzeitig mit echtem Gerät testen, Fallback via WLAN-Config-Portal |
| OpenFarm API unzuverlässige Schwellenwert-Daten | Hoch | Mittel | Eigene Mini-DB mit 50–100 Pflanzen kuratieren |
| ElevenLabs Kosten bei Scale | Mittel | Mittel | Caching von generierten MP3s, Rate Limits |
| WhatsApp Meta-Genehmigung verweigert | Mittel | Niedrig | Telegram als vollwertiger Ersatz für Beta |
| Beta-Tester vergessen Sensor zu laden | Hoch | Niedrig | Unter-15%-Notification als P2 vorziehen |
