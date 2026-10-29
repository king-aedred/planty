import type { DemoMessage, HistoryMetric, HistoryRange } from '@/components/screens/demo-data'
import { PlantDetailScreen } from '@/components/screens/plant-detail'
import { LoadingScreen } from '@/components/ui/loading-screen'
import { deviceOf, useGarden } from '@/hooks/use-garden'
import { useQuery } from 'convex/react'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { dayAndTime } from '../../lib/garden-format'

const HOUR = 60 * 60
const DAY = 24 * HOUR
// Zeitraum und Bündelung je Ansicht (Sekunden): 24 Std. einzeln, 7 Tage in 6-Std.-Blöcken, 30 Tage je Tag.
const RANGE: Record<HistoryRange, { span: number; bucket: number }> = {
  '24h': { span: DAY, bucket: 0 },
  '7d': { span: 7 * DAY, bucket: 6 * HOUR },
  '30d': { span: 30 * DAY, bucket: DAY },
}

type Reading = { measured_at: number; moisture_pct: number | null; temperature_c: number | null; lux: number | null }

function series(readings: Reading[], metric: HistoryMetric, range: HistoryRange, nowSeconds: number) {
  const { span, bucket } = RANGE[range]
  const pick = (reading: Reading) => (metric === 'moisture' ? reading.moisture_pct : metric === 'temperature' ? reading.temperature_c : reading.lux)
  const points = readings
    .filter((reading) => reading.measured_at >= nowSeconds - span)
    .map((reading) => ({ at: reading.measured_at, value: pick(reading) }))
    .filter((point): point is { at: number; value: number } => typeof point.value === 'number')
  const round = (value: number) => (metric === 'temperature' ? Math.round(value * 10) / 10 : Math.round(value))
  if (!bucket) return points.map((point) => round(point.value))
  const buckets = new Map<number, number[]>()
  for (const point of points) {
    const key = Math.floor(point.at / bucket)
    buckets.set(key, [...(buckets.get(key) ?? []), point.value])
  }
  return Array.from(buckets.entries())
    .sort(([first], [second]) => first - second)
    .map(([, values]) => round(values.reduce((sum, value) => sum + value, 0) / values.length))
}

// Pflanzen-Detail (Screen 7) mit echten Daten: Zustand, Messwerte, Verlauf, Nachrichten, Sensor.
export default function PlantStatusScreen() {
  const router = useRouter()
  const { plant_id: plantId } = useLocalSearchParams<{ plant_id: string }>()
  const garden = useGarden()
  const [nowSeconds] = useState(() => Math.floor(Date.now() / 1000))
  const plant = garden.plants?.find((entry) => String(entry._id) === plantId)
  const deviceId = plant ? deviceOf(plant) : null
  const readings = useQuery(api.device_readings.getReadingsSince, deviceId ? { device_id: deviceId, since: nowSeconds - 30 * DAY } : 'skip')
  const dashboardPlant = garden.dashboardPlants.find((entry) => entry.id === plantId)
  const sensor = deviceId ? garden.sensorViews.find((entry) => entry.deviceId === deviceId) ?? null : null

  const messages: DemoMessage[] = useMemo(
    () =>
      (garden.messages ?? [])
        .filter((message) => deviceId && message.device_id === deviceId && message.type === 'plant_message')
        .slice(0, 3)
        .map((message) => ({ id: String(message._id), time: dayAndTime(message.created_at), text: message.text })),
    [deviceId, garden.messages],
  )

  if (garden.isLoading) {
    return <LoadingScreen />
  }
  if (!plant || !dashboardPlant) {
    return <Redirect href="/(home)/(tabs)/plant-list" />
  }

  return (
    <PlantDetailScreen
      plant={dashboardPlant}
      sensor={sensor}
      messages={messages}
      history={(metric, range) => series(readings ?? [], metric, range, nowSeconds)}
      moistureTarget={plant.moisture_threshold ?? 30}
      temperatureRange={`${plant.temperature_threshold_min ?? 15}–${plant.temperature_threshold_max ?? 30} °C`}
      onBack={() => router.back()}
      onOpenSettings={() => router.push({ pathname: '/(home)/plant-settings', params: { plant_id: plantId } })}
      onOpenSensor={() => deviceId && router.push({ pathname: '/(home)/sensor', params: { device_id: deviceId } })}
      onPairSensor={() => router.push('/(home)/add-sensor')}
    />
  )
}
