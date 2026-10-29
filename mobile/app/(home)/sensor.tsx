import { type CommandResult, type SensorCommand, SensorDetailScreen } from '@/components/screens/sensor-detail'
import { LoadingScreen } from '@/components/ui/loading-screen'
import { useDeviceCommand } from '@/hooks/use-device-command'
import { useGarden } from '@/hooks/use-garden'
import { useMutation } from 'convex/react'
import { type Href, Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { api } from '../../../convex/_generated/api'

// Wie lange auf das Ack gewartet wird, bevor „liegt bereit“ angezeigt wird (am Akku holt der Sensor
// Befehle erst bei der nächsten Messung ab).
const COMMAND_WAIT_MS = 45 * 1000

// Sensor-Detail (Screen 10) mit echten Daten und Befehlen.
export default function SensorScreen() {
  const router = useRouter()
  const { device_id: deviceId } = useLocalSearchParams<{ device_id: string }>()
  const garden = useGarden()
  const command = useDeviceCommand()
  const requestMeasureNow = useMutation(api.device_commands.requestMeasureNow)
  const requestSetWifi = useMutation(api.device_commands.requestSetWifi)
  const requestFactoryReset = useMutation(api.device_commands.requestFactoryReset)
  const removeSensor = useMutation(api.device_commands.removeSensor)

  const sensor = garden.sensorViews.find((entry) => entry.deviceId === deviceId)
  const plant = deviceId ? garden.plantByDevice.get(deviceId) : undefined

  if (garden.isLoading) {
    return <LoadingScreen />
  }
  if (!sensor || !deviceId) {
    // Sensor gibt es (nicht mehr), z. B. nach dem Entfernen.
    return <Redirect href="/(home)/(tabs)/sensors" />
  }

  const runCommand = async (type: SensorCommand, params?: { ssid: string; password: string }): Promise<CommandResult> => {
    const start =
      type === 'measure'
        ? () => requestMeasureNow({ device_id: deviceId })
        : type === 'wifi'
          ? () => requestSetWifi({ device_id: deviceId, ssid: params?.ssid ?? '', password: params?.password ?? '' })
          : () => requestFactoryReset({ device_id: deviceId })
    const outcome = await command.run(start, { timeoutMs: COMMAND_WAIT_MS })
    if (outcome.kind === 'ok') return { kind: 'ok' }
    if (outcome.kind === 'waiting') return { kind: 'waiting' }
    if (outcome.kind === 'aborted') return { kind: 'failed', message: 'Abgebrochen.' }
    return { kind: 'failed', message: outcome.message }
  }

  return (
    <SensorDetailScreen
      sensor={sensor}
      onBack={() => router.back()}
      onOpenPlant={plant ? () => router.push({ pathname: '/(home)/status', params: { plant_id: String(plant._id) } }) : undefined}
      onAssignPlant={() => router.push({ pathname: '/(home)/assign-sensor', params: { device_id: deviceId } } as unknown as Href)}
      onRemove={async () => {
        await removeSensor({ device_id: deviceId })
      }}
      onRemoved={() => router.back()}
      runCommand={runCommand}
    />
  )
}
