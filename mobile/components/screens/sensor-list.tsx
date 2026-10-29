import { Badge } from '@/components/ui/badge'
import { BatteryIndicator } from '@/components/ui/battery-indicator'
import { Card } from '@/components/ui/card'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { Text, useTheme, XStack, YStack } from 'tamagui'
import type { DemoSensor } from './demo-data'

export const SENSOR_BADGE: Record<DemoSensor['status'], { tone: 'success' | 'warning' | 'neutral' | 'critical'; label: string }> = {
  active: { tone: 'success', label: 'Aktiv' },
  low_battery: { tone: 'warning', label: 'Akku schwach' },
  free: { tone: 'neutral', label: 'Frei' },
  offline: { tone: 'critical', label: 'Offline' },
}

export function signalLevel(rssi: number) {
  if (rssi >= -55) return 4
  if (rssi >= -67) return 3
  if (rssi >= -78) return 2
  return 1
}

// Sensoren (Tab): Pflanze, Akku, Signal, zuletzt gemeldet, Zustand; antippen öffnet das Sensor-Detail.
export function SensorList({ sensors, onOpen, onPair }: { sensors: DemoSensor[]; onOpen: (sensor: DemoSensor) => void; onPair: () => void }) {
  const theme = useTheme()

  if (sensors.length === 0) {
    return (
      <YStack alignItems="center" gap="$8" paddingVertical="$32">
        <Ionicons name="radio-outline" size={32} color={theme.textSecondary?.val} />
        <Text fontFamily="$body" fontSize={14} color="$textSecondary" textAlign="center">
          Noch kein Sensor gekoppelt.
        </Text>
        <Text fontFamily="$body" fontWeight="700" fontSize={14} color="$accentText" onPress={onPair} role="button">
          Sensor koppeln
        </Text>
      </YStack>
    )
  }

  return (
    <YStack gap="$12">
      <Card dense>
        {sensors.map((sensor, index) => {
          const badge = SENSOR_BADGE[sensor.status]
          return (
            <XStack
              key={sensor.name}
              role="button"
              onPress={() => onOpen(sensor)}
              gap="$12"
              padding="$12"
              alignItems="center"
              borderTopWidth={index > 0 ? 1 : 0}
              borderColor="$border"
              backgroundColor="transparent press:$surfaceElevated"
            >
              <YStack width={40} height={40} borderRadius="$12" backgroundColor="$surfaceElevated" alignItems="center" justifyContent="center">
                <Ionicons name="radio-outline" size={20} color={theme.accentText?.val} />
              </YStack>
              <YStack flex={1} gap="$4">
                <Text fontFamily="$body" fontWeight="600" fontSize={15} color="$textPrimary">
                  {sensor.plantName ?? 'Keiner Pflanze zugeordnet'}
                </Text>
                <XStack gap="$12" alignItems="center">
                  <BatteryIndicator percent={sensor.battery} charging={sensor.charging} />
                  <MaterialCommunityIcons name={`wifi-strength-${signalLevel(sensor.rssi)}` as 'wifi-strength-1'} size={16} color={theme.textSecondary?.val} />
                  <Text fontFamily="$body" fontSize={12} color="$textSecondary">
                    {sensor.lastSeen}
                  </Text>
                </XStack>
              </YStack>
              <XStack>
                <Badge tone={badge.tone} label={badge.label} />
              </XStack>
              <Ionicons name="chevron-forward" size={16} color={theme.outlineVariant?.val} />
            </XStack>
          )
        })}
      </Card>
      {sensors.some((sensor) => sensor.status === 'free') ? (
        <Text fontFamily="$body" fontSize={12} color="$textSecondary" textAlign="center">
          Tipp: Ein freier Sensor lässt sich einer Pflanze zuordnen.
        </Text>
      ) : null}
    </YStack>
  )
}
