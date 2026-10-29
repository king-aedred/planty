import type { DashboardPlant } from '@/components/plants/plant-dashboard'
import type { DemoSensor } from '@/components/screens/demo-data'
import type { InboxItem } from '@/components/screens/inbox-list'
import { useQueries, useQuery } from 'convex/react'
import { useMemo } from 'react'
import type { Doc } from '../../convex/_generated/dataModel'
import { api } from '../../convex/_generated/api'
import { clockTime, dayLabel, relativeTime } from '../lib/garden-format'

// Alle Daten der Haupt-Screens aus Convex, aufbereitet für die Bausteine in components/screens und
// components/plants (gleiche Formen wie die Vorschau-Daten).

type PlantDoc = Doc<'plants'> & { latestSummary: Doc<'session_summaries'> | null }
type SensorDoc = Doc<'sensors'> & { battery_pct?: number; battery_charging: boolean; has_plant: boolean }

// Ohne Kontakt länger als 2 Std. über dem angekündigten Zeitpunkt gilt der Sensor als offline (wie im Backend).
const OFFLINE_AFTER_MS = 2 * 60 * 60 * 1000
const LOW_BATTERY_PCT = 20

export const deviceOf = (plant: Doc<'plants'>) => plant.device_id ?? plant.sensor_id ?? null

export function sensorView(sensor: SensorDoc, plantName: string | null, now = Date.now()): DemoSensor {
  const battery = typeof sensor.battery_pct === 'number' ? sensor.battery_pct : null
  const nextContact = sensor.next_contact_at ?? null
  const offline = nextContact !== null && now > nextContact + OFFLINE_AFTER_MS
  return {
    deviceId: sensor.device_id,
    name: `CALLGREEN-${sensor.device_id.replace(/^cg-/, '')}`,
    plantName,
    battery,
    charging: sensor.battery_charging,
    rssi: sensor.last_status?.rssi ?? -70,
    ssid: '',
    firmware: sensor.firmware_version ?? '–',
    lastSeen: relativeTime(sensor.last_seen, now),
    nextMeasurement: nextContact && nextContact > now ? clockTime(nextContact) : '–',
    status: offline ? 'offline' : !plantName ? 'free' : battery !== null && battery < LOW_BATTERY_PCT ? 'low_battery' : 'active',
  }
}

export function useGarden() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user } = useUser()
  const clerkId = user?.id ?? ''
  const plants = useQuery(api.plants.getAllPlantsByClerkId, clerkId ? { clerk_id: clerkId } : 'skip') as PlantDoc[] | undefined
  const sensors = useQuery(api.sensors.getSensorsByClerkId, clerkId ? {} : 'skip') as SensorDoc[] | undefined
  const messages = useQuery(api.messages.getMessagesByClerkId, clerkId ? { clerk_id: clerkId } : 'skip')
  const appUser = useQuery(api.users.getUserByClerkId, clerkId ? { clerk_id: clerkId } : 'skip')

  // Artnamen je Pflanze (wechselnde Anzahl, deshalb useQueries; Objekt stabil halten gegen Render-Schleifen).
  const speciesIds = useMemo(
    () => Array.from(new Set((plants ?? []).map((plant) => plant.species_id).filter((id): id is string => Boolean(id)))),
    [plants],
  )
  const speciesQueries = useMemo(
    () => Object.fromEntries(speciesIds.map((id) => [id, { query: api.plant_species.getPlantSpeciesById, args: { id } }])),
    [speciesIds],
  )
  const speciesResults = useQueries(speciesQueries) as Record<string, { common_name: string; name: string } | null | undefined | Error>

  return useMemo(() => {
    const now = Date.now()
    const speciesOf = (plant: Doc<'plants'>) => {
      const species = plant.species_id ? speciesResults[plant.species_id] : undefined
      return species && !(species instanceof Error) ? species : null
    }
    const sensorByDevice = new Map((sensors ?? []).map((sensor) => [sensor.device_id, sensor]))
    const plantByDevice = new Map<string, PlantDoc>()
    for (const plant of plants ?? []) {
      const deviceId = deviceOf(plant)
      if (deviceId) plantByDevice.set(deviceId, plant)
    }
    // Neueste Nachricht je Sensor als Zitat der Pflanze.
    const latestByDevice = new Map<string, Doc<'messages'>>()
    for (const message of messages ?? []) {
      const current = latestByDevice.get(message.device_id)
      if (!current || message.created_at > current.created_at) latestByDevice.set(message.device_id, message)
    }

    const sensorViews = (sensors ?? []).map((sensor) => sensorView(sensor, plantByDevice.get(sensor.device_id)?.name ?? null, now))
    const sensorViewByDevice = new Map(sensorViews.map((view) => [view.deviceId ?? '', view]))

    const dashboardPlants: DashboardPlant[] = (plants ?? []).map((plant) => {
      const deviceId = deviceOf(plant)
      const sensor = deviceId ? sensorViewByDevice.get(deviceId) : undefined
      const summary = plant.latestSummary
      const detailParts = sensor
        ? [sensor.nextMeasurement !== '–' ? `Nächste Messung ${sensor.nextMeasurement}` : `Zuletzt ${sensor.lastSeen}`, sensor.battery !== null ? `Akku ${sensor.battery} %` : null]
        : []
      return {
        id: String(plant._id),
        name: plant.name,
        character: plant.character ?? null,
        speciesName: speciesOf(plant)?.common_name ?? null,
        quote: deviceId ? latestByDevice.get(deviceId)?.text ?? null : null,
        hasSensor: Boolean(deviceId && sensorByDevice.has(deviceId)),
        detail: detailParts.filter(Boolean).join(' · '),
        summary: summary
          ? {
              moisture_median: summary.moisture_median,
              temperature_median: summary.temperature_median,
              light_level_median: summary.light_level_median,
              moisture_state: summary.moisture_state,
              temperature_state: summary.temperature_state,
              light_state: summary.light_state,
            }
          : null,
      }
    })

    const inboxItems: InboxItem[] = (messages ?? []).map((message) => {
      const plant = plantByDevice.get(message.device_id)
      const tone = message.state === 'critical' ? 'critical' : message.state === 'warning' ? 'warning' : 'success'
      return {
        id: String(message._id),
        day: dayLabel(message.created_at, now),
        time: clockTime(message.created_at),
        title: message.type === 'system_message' ? 'Callgreen' : message.plant_name,
        text: message.text,
        unread: !message.read,
        avatar: message.type === 'system_message' ? null : { mood: tone === 'critical' ? 'sad' : plant?.character ?? 'neutral', tone },
      }
    })

    return {
      clerkId,
      user,
      appUser,
      plants,
      sensors,
      messages,
      isLoading: plants === undefined || sensors === undefined,
      dashboardPlants,
      sensorViews,
      inboxItems,
      plantByDevice,
      speciesOf,
    }
  }, [appUser, clerkId, messages, plants, sensors, speciesResults, user])
}
