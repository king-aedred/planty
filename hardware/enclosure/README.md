# Gehäuse v7 (Entwurf): schlanke runde Kapsel, Bajonett

Ø 28 × 191 mm. Unten ragt der Bodensensor (98 × 23 mm) 63 mm heraus, 35 mm stecken im Gehäuse.

**Stückliste:** Rohr, Kopf, Fenstereinsatz (alle gedruckt), Platine, Sonde mit PH-Kabel, Zelle mit Dupont-Kabel.
Dazu neutralvernetzendes Silikon für den Bodenschlitz.

- **Rohr** (0–113 mm): Sonde in Führungsnuten (Einsetzen von oben durch eine Nut in Ringen und Zapfen),
  12 mm Platz für ihren Stecker, drei gedruckte Federzungen, darauf die 18650 (Ø 19) in zwei Ringen;
  oben ein Zapfen mit drei L-Nuten (Bajonett) und einer Kerbe fürs Sondenkabel.
- **Kopf** (106–191 mm): Platine v3, USB-C, Lichtfenster, Lüftung (AHT20), Kuppel (innen 45°-Schräge + flache Decke).
  Schräge Anschläge spannen die Zelle 0,6 mm in die Federzungen. Unter der Platine 22 mm für Stecker und Kabelbögen.
- **Fenstereinsatz** (`window.stl`): naturfarbenes PETG, eigener kleiner Druck (Rolle wechseln). Wird von außen
  eingedrückt und sitzt auf einer Schulter (Wasserdruck drückt ihn fester rein). Presssitz 0,1 mm.
- **Platine:** von unten einschieben; ein gedruckter Schnapphaken greift unter die untere Kante, Klemmrippen
  verhindern Klappern, oben Anschlag. Lösen: Hakenzunge von unten zur Wand drücken.
- **Bajonett:** Kopf 45° verdreht aufsetzen, Achteldrehung im Uhrzeigersinn bis zum Klick. Hält gegen Zug.

| Datei | Inhalt |
|---|---|
| `callgreen_case.py` | Parametrisches Modell (CadQuery); alle Maße oben im Skript |
| `check_all.py` | Prüft Endlagen und Einbauwege aller Teile (Sonde, Zelle, Kabel, Stecker, Platine, Bajonett, Fenster) |
| `body.stl`, `head.stl`, `window.stl` | Druckdateien |
| `case.step` | Zum Weiterbearbeiten in Onshape/Fusion |
| `callgreen.glb`, `callgreen_exploded.glb` | Für Blender (Datei → Importieren → glTF 2.0); `export_glb.py <platine.step> [--explode]` |
| `callgreen_assembly.glb` | Zusammenbau-Animation (18 s; in Blender Endframe 432 bei 24 fps); `node animate_glb.mjs` |
| `animation_frames.png` | Standbilder der Animation |

Erzeugen: `pip install cadquery`, dann `python callgreen_case.py` und `python check_all.py <platine.step>`.

## Druck
- PETG, 0,4-mm-Düse, 0,2 mm Schicht, 4 Wände, 25 % Füllung. Rohr und Kopf in beliebiger Farbe.
- Fenstereinsatz: naturfarbenes PETG, 100 % Füllung, auf der flachen Innenseite stehend.
- Rohr und Kopf stehend ohne Stützmaterial (Kopf auf der offenen Unterkante). Innere Absätze, Federzungen,
  Haken und Kuppelinnenseite sind unter 45° oder als kurze Brücke ausgeführt.

## Montage
1. Sonde (Buchse zur +Y-Seite, d. h. Richtung Lichtfenster) von oben durch die Nut bis in den Bodenschlitz schieben;
   Schlitz innen und außen mit neutralvernetzendem Silikon abdichten.
2. Sondenkabel an der Wand nach oben führen (Kerbe im Zapfen); Kabel kürzen (Zelle → H2 ca. 8 cm, Sonde → U4 ca. 15 cm).
3. Zelle auf die Federzungen setzen.
4. Fenstereinsatz von außen in den Kopf drücken.
5. Platine von unten in den Kopf schieben, Antenne voran, bis der Haken einschnappt.
6. Stecker auf H2 und U4. Kopf 45° gegen den Uhrzeigersinn verdreht aufsetzen, herunterdrücken, im Uhrzeigersinn bis zum Klick drehen.

Akkutausch: Kopf zurückdrehen und abziehen, Zelle ragt 4 mm über den Zapfen, Dupont-Buchse abziehen, Zelle herausziehen.

## Offen / vor dem Druck prüfen
- Zellenlänge (`CELL_LEN` = 70 mm) nachmessen; Vorspannung gleicht ±0,3 mm aus.
- Sonde: Kanten auf den untersten 35 mm frei von Bauteilen? Maße der PH-Buchse (`PROBE_SOCKET`) und der Kerben.
- Drucker-abhängig, erst Kopf + oberste 15 mm des Rohrs testen: Bajonett-Rastpunkt (`DETENT`), Klemmrippen (`CRUSH_R`),
  Presssitz Fenster (`WINDOW_PRESS`), Schnapphaken (`HOOK_T`).
- Haken greift 1 mm unter die Platine (daneben sitzt C17 auf der Unterseite).
- USB: Laufbahn lässt an der dünnsten Stelle ca. 1 mm Wand; Restwand vor der Buchse 0,7 mm, Mulde 12,8 × 7 mm.
- Lux-Werte durch den Fenstereinsatz gedämpft: einmal ohne/mit Kopf messen, Faktor eintragen.
- Länge 191 mm, fast nur wegen der Stecker über die Platinenkante. Mit Platine v4 (Stecker liegend) deutlich kürzer.
