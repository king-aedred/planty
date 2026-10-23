// Akkustand in Prozent für die App. Einzige Stelle der Umrechnung, damit die Kennlinie später
// (Langzeitmessung) nachgeschärft werden kann, ohne Firmware oder App anzufassen.
//
// Kennlinie: typischer Verlauf einer 18650-Zelle (INR18650-30Q) bei kleinem Strom, Ruhespannung.
// 0 % liegt bei 3,2 V: Darunter sendet die Firmware nicht mehr (critical_battery_v).
const CURVE: ReadonlyArray<readonly [number, number]> = [
  [3.2, 0],
  [3.3, 2],
  [3.4, 5],
  [3.5, 10],
  [3.6, 18],
  [3.65, 25],
  [3.7, 35],
  [3.75, 45],
  [3.8, 52],
  [3.85, 60],
  [3.9, 67],
  [4.0, 80],
  [4.1, 92],
  [4.15, 100],
];

// Glättung: neuer Wert = alter Wert + ALPHA * (Messwert - alter Wert). Klein genug, dass ADC-Rauschen
// und Temperatur nicht springen lassen, groß genug, dass echte Entladung nach wenigen Messungen sichtbar wird.
const ALPHA = 0.2;

export function batteryPercentFromVoltage(voltage: number): number {
  if (voltage <= CURVE[0][0]) return 0;
  const last = CURVE[CURVE.length - 1];
  if (voltage >= last[0]) return 100;
  for (let i = 1; i < CURVE.length; i++) {
    const [v1, p1] = CURVE[i];
    if (voltage <= v1) {
      const [v0, p0] = CURVE[i - 1];
      return Math.round(p0 + ((voltage - v0) / (v1 - v0)) * (p1 - p0));
    }
  }
  return 100;
}

// Geglätteter Akkustand für sensors.battery_pct. Die Anzeige soll genau wirken (81 %, 82 %) und
// trotzdem ruhig bleiben:
// - Beim Laden oder am USB ist die Spannung künstlich erhöht. Dann den Rohwert speichern, die App
//   zeigt ohnehin "lädt".
// - Erste Messung nach dem Laden (oder überhaupt): Rohwert als neuer Startpunkt.
// - Sonst nur fallen, nie steigen: Ein Akku lädt sich ohne USB nicht auf, ein höherer Messwert
//   ist Rauschen oder Erholung der Zelle.
// Gespeichert wird mit Nachkommastellen, damit kleine Schritte nicht verloren gehen; angezeigt
// wird gerundet (displayBatteryPercent).
export function nextBatteryPercent(args: {
  previous: number | undefined;
  voltage: number;
  charging: boolean;
  previousCharging: boolean;
}): number {
  const raw = batteryPercentFromVoltage(args.voltage);
  if (args.charging || args.previousCharging || args.previous === undefined) return raw;
  if (raw >= args.previous) return args.previous;
  return Math.max(0, Math.round((args.previous + ALPHA * (raw - args.previous)) * 10) / 10);
}

export function displayBatteryPercent(stored: number): number {
  return Math.min(100, Math.max(0, Math.round(stored)));
}
