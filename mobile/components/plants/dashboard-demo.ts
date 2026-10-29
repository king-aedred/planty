import type { DashboardPlant } from './plant-dashboard'

// Beispielpflanzen für Vorschau-Seiten (Werte aus dem Stitch-Template plus eine Pflanze ohne Sensor).
export const DEMO_PLANTS: DashboardPlant[] = [
  {
    id: 'monty',
    name: "Monstera 'Monty'",
    character: 'happy',
    speciesName: 'Monstera deliciosa',
    quote: "Mir geht's blendend, danke!",
    summary: { moisture_median: 54, temperature_median: 21.8, light_level_median: 1820, moisture_state: 'ok', temperature_state: 'ok', light_state: 'ok' },
  },
  {
    id: 'cleo',
    name: "Calathea 'Cleo'",
    character: 'grumpy',
    speciesName: 'Calathea orbifolia',
    quote: 'Bald ein Schluck Wasser bitte.',
    summary: { moisture_median: 21, temperature_median: 19.4, light_level_median: 940, moisture_state: 'warning', temperature_state: 'ok', light_state: 'ok' },
  },
  {
    id: 'ben',
    name: "Ficus 'Ben'",
    character: 'neutral',
    speciesName: 'Ficus benjamina',
    quote: 'Ich verdurste! 350ml nötig.',
    summary: { moisture_median: 11, temperature_median: 24.1, light_level_median: 2450, moisture_state: 'critical', temperature_state: 'ok', light_state: 'ok' },
  },
  {
    id: 'pepe',
    name: "Pilea 'Pepe'",
    character: 'neutral',
    speciesName: 'Pilea peperomioides',
    quote: 'Perfektes Licht heute!',
    summary: { moisture_median: 48, temperature_median: 22, light_level_median: 1450, moisture_state: 'ok', temperature_state: 'ok', light_state: 'ok' },
  },
  {
    id: 'ruby',
    name: 'Ruby',
    character: 'happy',
    speciesName: 'Gummibaum',
    hasSensor: false,
    summary: null,
  },
]

// Erfundener Feuchte-Verlauf der letzten 24 Messungen je Pflanze (nur Vorschau).
export const DEMO_MOISTURE_HISTORY: Record<string, number[]> = {
  monty: [62, 61, 60, 60, 59, 58, 58, 57, 57, 56, 56, 55, 55, 55, 54, 54, 54, 55, 54, 54, 54, 54, 54, 54],
  cleo: [44, 42, 40, 38, 37, 35, 34, 33, 31, 30, 29, 28, 27, 26, 26, 25, 24, 24, 23, 23, 22, 22, 21, 21],
  ben: [33, 31, 29, 27, 25, 24, 22, 21, 20, 19, 18, 17, 16, 15, 15, 14, 14, 13, 13, 12, 12, 12, 11, 11],
  pepe: [70, 52, 51, 50, 50, 49, 49, 49, 48, 48, 48, 48, 49, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48],
}

export type DemoTone = 'success' | 'warning' | 'critical' | 'neutral'

// Grober Zustand für die Varianten-Vorschauen (ohne Sensor = neutral).
export function demoTone(plant: DashboardPlant): DemoTone {
  if (plant.hasSensor === false || !plant.summary) return 'neutral'
  if (plant.summary.moisture_state === 'critical') return 'critical'
  if (plant.summary.moisture_state !== 'ok') return 'warning'
  return 'success'
}

export const TONE_COLOR: Record<DemoTone, string> = {
  success: '$success',
  warning: '$warning',
  critical: '$criticalText',
  neutral: '$outline',
}
