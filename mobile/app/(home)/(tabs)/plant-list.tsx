import { api } from '../../../../convex/_generated/api'
import { type DashboardPlant, PlantDashboard } from '../../../components/plants/plant-dashboard'
import { Screen } from '../../../components/ui/screen'
import { useQueries, useQuery } from 'convex/react'
import { useRouter } from 'expo-router'
import { useMemo, useRef } from 'react'

// "Meine Pflanzen": holt die Daten und gibt sie an das Dashboard (Darstellung in components/plants/plant-dashboard.tsx).
export default function PlantListScreen() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user } = useUser()
  const router = useRouter()
  const secretTapCountRef = useRef(0)
  const secretTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clerkId = user?.id ?? ''
  const plants = useQuery(api.plants.getAllPlantsByClerkId, clerkId ? { clerk_id: clerkId } : 'skip')
  const sensors = useQuery(api.sensors.getSensorsByClerkId, clerkId ? {} : 'skip')
  const messages = useQuery(api.messages.getMessagesByClerkId, clerkId ? { clerk_id: clerkId } : 'skip')
  const unreadCount = useQuery(api.messages.getUnreadCount, clerkId ? { clerk_id: clerkId } : 'skip')

  // Artnamen je Pflanze (wechselnde Anzahl, deshalb useQueries statt einzelner Hooks).
  const speciesIds = useMemo(
    () => Array.from(new Set((plants ?? []).map((plant) => plant.species_id).filter((id): id is string => Boolean(id)))),
    [plants],
  )
  // Abfrage-Objekt stabil halten: ein neues Objekt bei jedem Rendern führt zu einer Render-Schleife.
  const speciesQueries = useMemo(
    () => Object.fromEntries(speciesIds.map((id) => [id, { query: api.plant_species.getPlantSpeciesById, args: { id } }])),
    [speciesIds],
  )
  const speciesResults = useQueries(speciesQueries) as Record<string, { name: string } | null | undefined | Error>

  const dashboardPlants = useMemo<DashboardPlant[] | undefined>(() => {
    if (!plants) return undefined
    // Letzte Nachricht je Sensor als Zitat der Pflanze.
    const latestByDevice = new Map<string, { text: string; created_at: number }>()
    for (const message of (messages ?? []) as { device_id: string; text: string; created_at: number }[]) {
      const current = latestByDevice.get(message.device_id)
      if (!current || message.created_at > current.created_at) latestByDevice.set(message.device_id, message)
    }

    return plants.map((plant) => {
      const deviceId = plant.device_id ?? plant.sensor_id ?? null
      const species = plant.species_id ? speciesResults[plant.species_id] : undefined
      return {
        id: String(plant._id),
        name: plant.name,
        character: plant.character ?? null,
        speciesName: species && !(species instanceof Error) ? species.name : null,
        quote: deviceId ? latestByDevice.get(deviceId)?.text ?? null : null,
        summary: plant.latestSummary ?? null,
        hasSensor: Boolean(deviceId),
      }
    })
  }, [messages, plants, speciesResults])

  const handleWordmarkPress = () => {
    secretTapCountRef.current += 1
    if (secretTapTimeoutRef.current) clearTimeout(secretTapTimeoutRef.current)
    secretTapTimeoutRef.current = setTimeout(() => {
      secretTapCountRef.current = 0
      secretTapTimeoutRef.current = null
    }, 900)

    if (secretTapCountRef.current >= 5) {
      secretTapCountRef.current = 0
      if (secretTapTimeoutRef.current) {
        clearTimeout(secretTapTimeoutRef.current)
        secretTapTimeoutRef.current = null
      }
      router.push('/demo-call')
    }
  }

  return (
    <Screen scroll>
      <PlantDashboard
        plants={dashboardPlants}
        activeSensors={(sensors ?? []).filter((sensor) => sensor.status === 'active').length}
        totalSensors={(sensors ?? []).length}
        unreadCount={typeof unreadCount === 'number' ? unreadCount : 0}
        onOpenPlant={(plantId) => router.push({ pathname: '/(home)/status', params: { plant_id: plantId } })}
        onAddPlant={() => router.push('/(home)/add-plant')}
        onPairSensor={() => router.push('/(home)/add-sensor')}
        onOpenInbox={() => router.push('/(home)/(tabs)/inbox')}
        onOpenProfile={() => router.push('/(home)/(tabs)/global-settings')}
        onWordmarkPress={handleWordmarkPress}
      />
    </Screen>
  )
}
