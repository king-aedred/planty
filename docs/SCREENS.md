# Callgreen App: Screens und Features

Stand: 2026-10-26 · Arbeitsliste für die UI-Runde. Gebaut wird in der Reihenfolge unten (User-Flow), Screen für Screen im Browser (`http://100.86.32.59:8099`).

## Entscheidungen (26.10.)

- **4 Tabs** bleiben: Pflanzen, Nachrichten, Sensoren, Einstellungen.
- **Sensor-Detail** wird eine eigene Seite. Das Pflanzen-Detail zeigt nur noch eine Sensor-Zeile mit Link.
- **Gießen:** keine Knöpfe „Jetzt gießen“/„Gegossen“. Kritische Pflanzen zeigen einen Hinweis („Braucht Wasser“). Quittieren + Kontrolle per Messung (Charakter-Reaktion) ist ein späteres Feature.
- **Filter und Standort:** später, zusammen. Filter-Knopf vorerst entfernen.
- **Pflanze ohne Sensor:** bleibt erlaubt, braucht einen eigenen Zustand.
- **„Passwort vergessen“:** wird jetzt gebaut.
- **Chips „Automatische Analyse“ / „Sofort-Tipps“:** gewollt, aber erst später mit echtem Inhalt. Vorerst entfernen.
- **Entfällt:** „Messzeit“ in den Einstellungen (gespeichert, aber nirgends genutzt; die Firmware hat einen festen Messplan), Burger-Menü.

## Screens (Soll), in Bau-Reihenfolge

Fertig (UI, 28.10.): 0 Willkommen, 1 Login, 2 Registrieren, 2b Code, 3 Passwort vergessen. Echte Clerk-Wege für Passwort vergessen und Code beim Login noch mit Testkonto prüfen.

| # | Screen | Inhalt | Änderung gegenüber heute |
|---|---|---|---|
| 0 | **Willkommen (App-Start)** | Logo-Animation (Mitte → oben), „Hast du schon ein Konto?“ → Registrieren / Anmelden | **neu**; Start ohne Login landet hier statt im Login |
| 1 | Login | E-Mail, Passwort, Google/Apple | Logo/Texte „Callgreen“; SSO prüfen (geht heute nicht) |
| 2 | Registrieren | Benutzername, E-Mail, Passwort ×2, Nutzungsbedingungen (Link → Blatt von unten, Inhalt folgt in `constants/legal.ts`) | Überschrift „Gib deiner Pflanze eine Stimme!“, Platzhalter raus |
| 2b | **Code eingeben** | 6 Ziffernfelder, prüft automatisch, wackelt bei falschem Code, „Code erneut senden“, „Zurück“ | **neu**; gemeinsam für Registrieren (E-Mail) und Login (neues Gerät) |
| 3 | **Passwort vergessen** | E-Mail → Code → neues Passwort → angemeldet (Clerk `resetPasswordEmailCode`); Link im Login | **neu** |
| 4 | Einstieg / erste Pflanze | Willkommen → Sensor koppeln → Art + Name → fertig | ohne Burger-Menü; klarer Schrittfortschritt |
| 5 | Sensor koppeln (BLE) | USB-Hinweis, Scan, WLAN (Liste, Vorschlag, QR), Warten, Fehler | anzeigen, mit welchem WLAN der Sensor schon verbunden ist; „Planty“-Texte raus |
| 6 | Dashboard (Tab Pflanzen) | Kompakt/Detail, Avatar, Messwerte, letzte Nachricht, „x von y Sensoren aktiv“, Pflanze hinzufügen | Filter, Standort, Gieß-Knöpfe, Deko-Chips raus; Zustand „ohne Sensor“; kritisch = Hinweis |
| 7 | Pflanzen-Detail | 3 Messwerte, Verlauf (Messgröße, Zeitraum, eigener Bereich), Charakter, Sensor-Zeile → Sensor-Detail | Sensor-Aktionen ausgelagert |
| 8 | Pflanzen-Einstellungen | Name, Art, Persönlichkeit, Schwellenwerte, **Pflanze löschen** | Löschen neu (heute nur über „Sensor übertragen“) |
| 9 | Pflanze hinzufügen | Mit/ohne Sensor, freier Sensor oder von anderer Pflanze übertragen, Art, Name | Texte/Optik |
| 10 | **Sensor-Detail** | Akku (%), WLAN/Signal, Firmware, zuletzt gesehen, nächste Messung, zugeordnete Pflanze; Jetzt messen, WLAN ändern, Werkseinstellungen, Entfernen | **neu** (Inhalt aus Pflanzen-Detail) |
| 11 | Sensoren (Tab) | Liste: im Einsatz / frei, → Sensor-Detail, Sensor koppeln | Zeile öffnet Sensor-Detail |
| 12 | Nachrichten (Tab) | Liste, gelesen/ungelesen, Systemhinweise (offline, Akku) | Optik, Leerzustand |
| 13 | Einstellungen (Tab) | Benachrichtigungen (Kanäle je Zustand, Ruhezeiten, Max/Tag), Telegram, Profil, Telefonnummer, Ausloggen, Dev Tools (nur Dev) | „Messzeit“ raus |

Übergänge Willkommen → Login/Registrieren und Login ↔ Registrieren ↔ Code: Logo bleibt/gleitet, nur die Box blendet aus und ein (`components/auth/auth-shell.tsx`).

Nebenher: Start-Spinner mit Timeout (~15 s, „Keine Verbindung“ + „Erneut versuchen“), Login-Pflicht für alle Routen im Web, restliche „Planty“-Texte.

Unverändert / außerhalb der Runde: Fake-Anruf (`demo-call`), Dev Tools, Vorschau-Seiten.

## Später

- Gießen quittieren mit Kontrolle über die nächste Messung und Charakter-Reaktion
- Standort pro Pflanze + Filter/Sortierung im Dashboard
- „Automatische Analyse“ / „Sofort-Tipps“ mit echtem Inhalt
- Anruf als Kanal
