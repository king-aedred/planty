import type { DashboardPlant } from '@/components/plants/plant-dashboard'
import type { Species } from '@/components/plants/species-picker'

// Beispieldaten für die Vorschau der Detailseiten (Gesamtbild /preview/7-app). Alles wird deterministisch aus
// der Pflanze bzw. dem Sensor abgeleitet, damit dieselbe Pflanze immer gleich aussieht.

export type DemoSensor = {
  name: string
  plantName: string | null
  battery: number
  charging: boolean
  rssi: number
  ssid: string
  firmware: string
  lastSeen: string
  nextMeasurement: string
  status: 'active' | 'low_battery' | 'free' | 'offline'
}

export type DemoMessage = { id: string; time: string; text: string }

export type HistoryRange = '24h' | '7d' | '30d'
export type HistoryMetric = 'moisture' | 'temperature' | 'light'

function hash(text: string) {
  let value = 0
  for (const character of text) {
    value = (value * 31 + character.charCodeAt(0)) % 100000
  }
  return value
}

// Pseudozufall 0–1 aus Pflanze und Position.
function noise(seed: number, index: number) {
  const x = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453
  return x - Math.floor(x)
}

const POINTS: Record<HistoryRange, number> = { '24h': 24, '7d': 28, '30d': 30 }

// Verlauf, der beim aktuellen Wert endet: Feuchte fällt langsam (mit einem Gieß-Sprung), Temperatur und Licht
// schwanken im Tagesrhythmus.
export function demoHistory(plant: DashboardPlant, metric: HistoryMetric, range: HistoryRange): number[] {
  const seed = hash(plant.id) + (metric === 'moisture' ? 0 : metric === 'temperature' ? 7 : 13)
  const count = POINTS[range]
  const summary = plant.summary
  if (!summary) return []

  if (metric === 'moisture') {
    const end = summary.moisture_median
    // Punkte zwischen zwei Mal Gießen; innerhalb von 24 Std. wird nicht gegossen.
    const period = range === '24h' ? count : range === '7d' ? 10 : 9
    const slope = Math.min((70 - end) / period, range === '24h' ? 0.5 : 4)
    return Array.from({ length: count }, (_, index) => {
      const sinceWatering = (count - 1 - index) % period
      const value = end + sinceWatering * Math.max(slope, 0.3) + (noise(seed, index) - 0.5) * 2
      return Math.round(Math.max(0, Math.min(100, value)))
    })
  }

  const base = metric === 'temperature' ? summary.temperature_median ?? 21 : summary.light_level_median ?? 1000
  const swing = metric === 'temperature' ? 2.5 : base * 0.8
  return Array.from({ length: count }, (_, index) => {
    const dayPhase = range === '24h' ? (index / 24) * Math.PI * 2 : index * 0.9
    const value = base + Math.sin(dayPhase - Math.PI / 2) * swing + (noise(seed, index) - 0.5) * swing * 0.4
    return metric === 'temperature' ? Math.round(value * 10) / 10 : Math.max(0, Math.round(value))
  })
}

export function demoSensorFor(plant: DashboardPlant): DemoSensor | null {
  if (plant.hasSensor === false) return null
  const seed = hash(plant.id)
  const battery = 15 + (seed % 86)
  return {
    name: `CALLGREEN-${(seed * 7919).toString(16).toUpperCase().padStart(6, '0').slice(-6)}`,
    plantName: plant.name,
    battery,
    charging: false,
    rssi: -48 - (seed % 35),
    ssid: 'FRITZ!Box 7590 XY',
    firmware: '7.0.10',
    lastSeen: `vor ${1 + (seed % 50)} Min.`,
    nextMeasurement: '14:00',
    status: battery < 20 ? 'low_battery' : 'active',
  }
}

const MESSAGE_TEXTS: Record<'success' | 'warning' | 'critical', string[]> = {
  success: ['Perfektes Licht heute!', 'Mir geht’s blendend, danke!', 'Alles im grünen Bereich.'],
  warning: ['Bald ein Schluck Wasser bitte.', 'Es wird langsam trocken hier.'],
  critical: ['Ich verdurste! 350 ml nötig.', 'Hallo? Wasser?!'],
}

export function demoMessagesFor(plant: DashboardPlant): DemoMessage[] {
  if (plant.hasSensor === false) return []
  const state = plant.summary?.moisture_state
  const tone = state === 'critical' ? 'critical' : state === 'warning' ? 'warning' : 'success'
  const latest = plant.quote ?? MESSAGE_TEXTS[tone][0]
  return [
    { id: `${plant.id}-1`, time: 'Heute, 11:58', text: latest },
    { id: `${plant.id}-2`, time: 'Gestern, 18:30', text: MESSAGE_TEXTS.success[hash(plant.id) % 3] },
    { id: `${plant.id}-3`, time: 'Mo., 09:00', text: 'Danke fürs Gießen! 💧' },
  ]
}

// Schwellenwerte der Art (Beispiel); Pflanzen ohne Art bekommen allgemeine Werte.
export function demoThresholds(plant: DashboardPlant) {
  const seed = hash(plant.id)
  return {
    moisture: 25 + (seed % 15),
    temperatureMin: 15,
    temperatureMax: 28,
    lightMin: 500,
    lightMax: 5000,
  }
}

// Beispielarten für die Vorschau (echt: Convex plant_species).
const DEMO_SPECIES: Species[] = [
  { id: 'monstera', common_name: 'Monstera', name: 'Monstera deliciosa' },
  { id: 'calathea', common_name: 'Calathea', name: 'Calathea orbifolia' },
  { id: 'ficus', common_name: 'Birkenfeige', name: 'Ficus benjamina' },
  { id: 'pilea', common_name: 'Ufopflanze', name: 'Pilea peperomioides' },
  { id: 'sansevieria', common_name: 'Bogenhanf', name: 'Sansevieria trifasciata' },
  { id: 'efeutute', common_name: 'Efeutute', name: 'Epipremnum aureum' },
]

export function searchDemoSpecies(search: string) {
  const query = search.trim().toLowerCase()
  if (!query) {
    return []
  }
  return DEMO_SPECIES.filter((entry) => entry.common_name.toLowerCase().includes(query) || entry.name.toLowerCase().includes(query))
}

