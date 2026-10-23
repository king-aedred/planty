import { api } from '../../../../convex/_generated/api'
import { Button } from '../../../components/ui/button'
import { Card } from '../../../components/ui/card'
import { EmptyState } from '../../../components/ui/empty-state'
import { ListRow } from '../../../components/ui/list-row'
import { Screen } from '../../../components/ui/screen'
import { ScreenHeader } from '../../../components/ui/screen-header'
import { SectionLabel } from '../../../components/ui/section-label'
import { type DeviceState, StatusBadge } from '../../../components/ui/status-badge'
import { TAB_BAR_SPACE } from '../../../components/ui/tab-bar'
import { useMutation, useQuery } from 'convex/react'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert } from 'react-native'
import { Text, YStack } from 'tamagui'

// Akkuschwellen wie in convex/sensor_alerts.ts
const BATTERY_CRITICAL_V = 3.3
const BATTERY_LOW_V = 3.5

type SensorRow = {
  _id: string
  device_id: string
  has_plant: boolean
  status?: string
  last_battery_v?: number
  battery_pct?: number
  battery_charging?: boolean
}

function batteryText(sensor: SensorRow): string {
  if (sensor.battery_charging) return 'Akku lädt'
  return typeof sensor.battery_pct === 'number' ? `Akku ${sensor.battery_pct} %` : ''
}

function deviceStateOf(sensor: SensorRow): DeviceState {
  if (sensor.last_battery_v !== undefined && sensor.last_battery_v < BATTERY_CRITICAL_V) return 'battery_critical'
  if (sensor.last_battery_v !== undefined && sensor.last_battery_v < BATTERY_LOW_V) return 'battery_low'
  if (sensor.status === 'active' || sensor.status === 'offline' || sensor.status === 'charging' || sensor.status === 'measuring' || sensor.status === 'needs_remeasurement') {
    return sensor.status
  }
  return 'unknown'
}

export default function SensorsScreen() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user } = useUser()
  const router = useRouter()
  const clerkId = user?.id ?? ''
  const sensors = useQuery(api.sensors.getSensorsByClerkId, clerkId ? {} : 'skip') as SensorRow[] | undefined
  const removeSensor = useMutation(api.device_commands.removeSensor)
  const [removingDeviceId, setRemovingDeviceId] = useState('')

  const assigned = sensors?.filter((sensor) => sensor.has_plant) ?? []
  const free = sensors?.filter((sensor) => !sensor.has_plant) ?? []

  // Entfernen wirkt sofort im Backend: Besitz und Pflanzen werden gelöst, der Sensor verschwindet
  // aus der Liste (reaktive Query). Das Gerät selbst fällt beim nächsten Kontakt in "nicht zugeordnet".
  const handleRemoveSensor = (deviceId: string) => {
    Alert.alert(
      'Sensor entfernen?',
      'Der Sensor wird aus deinem Konto entfernt. Pflanzen, die ihm zugeordnet sind, werden gelöst. Wenn du ihn wieder nutzen willst, musst du ihn neu einrichten: per USB einstecken und über „Sensor koppeln“ verbinden.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Entfernen',
          style: 'destructive',
          onPress: () => {
            setRemovingDeviceId(deviceId)
            void removeSensor({ device_id: deviceId })
              .catch(() => {
                Alert.alert('Entfernen nicht möglich', 'Der Sensor konnte gerade nicht entfernt werden. Prüfe deine Verbindung und versuch es erneut.')
              })
              .finally(() => setRemovingDeviceId(''))
          },
        },
      ],
    )
  }

  return (
    <Screen scroll>
      <ScreenHeader eyebrow="Geräte" title="Sensoren" withMenu={false} />

      {sensors && sensors.length === 0 ? (
        <Card>
          <EmptyState
            icon="radio-outline"
            title="Noch kein Sensor"
            text="Steck deinen Sensor per USB-C ein und kopple ihn mit der App."
            action={{ label: 'Sensor koppeln', onPress: () => router.push('/(home)/add-sensor') }}
          />
        </Card>
      ) : null}

      {free.map((sensor) => (
        <Card key={sensor._id}>
          <YStack gap="$4">
            <Text fontFamily="$heading" fontSize={20} color="$textPrimary">
              Sensor {sensor.device_id}
            </Text>
            <Text fontFamily="$body" fontSize={14} lineHeight="$4" color="$textSecondary">
              Noch keiner Pflanze zugeordnet. Dein Sensor ist bereit für den nächsten Schritt.
            </Text>
          </YStack>
          <Button onPress={() => router.push({ pathname: '/(home)/add-plant', params: { device_id: sensor.device_id } })}>Pflanze zuordnen</Button>
          <Button variant="danger" disabled={removingDeviceId === sensor.device_id} onPress={() => handleRemoveSensor(sensor.device_id)}>
            {removingDeviceId === sensor.device_id ? 'Wird entfernt …' : 'Sensor entfernen'}
          </Button>
        </Card>
      ))}

      {assigned.length > 0 ? (
        <YStack gap="$8">
          <SectionLabel>Im Einsatz</SectionLabel>
          <Card dense>
            {assigned.map((sensor, index) => (
              <ListRow
                key={sensor._id}
                divider={index > 0}
                title={sensor.device_id}
                subtitle={['Einer Pflanze zugeordnet', batteryText(sensor)].filter(Boolean).join(' · ')}
                trailing={<StatusBadge state={deviceStateOf(sensor)} />}
              />
            ))}
          </Card>
        </YStack>
      ) : null}

      {sensors && sensors.length > 0 ? (
        <Button variant="secondary" onPress={() => router.push('/(home)/add-sensor')}>
          Sensor koppeln
        </Button>
      ) : null}

      <YStack height={TAB_BAR_SPACE} />
    </Screen>
  )
}
