import Ionicons from '@expo/vector-icons/Ionicons'
import { Text, XStack, useTheme } from 'tamagui'

// Akkustand des Sensors. Der Prozentwert ist im Backend geglättet (convex/battery.ts),
// hier wird nur dargestellt. Grenzen passend zu den Hinweisen: unter 10 % "bald laden", unter 3 % dringend.
type BatteryIndicatorProps = {
  percent: number | null | undefined
  charging?: boolean
}

export function BatteryIndicator({ percent, charging = false }: BatteryIndicatorProps) {
  const theme = useTheme()

  if (charging) {
    return (
      <XStack alignItems="center" gap="$4">
        <Ionicons name="battery-charging-outline" size={18} color={theme.success?.val} />
        <Text fontFamily="$body" fontSize={13} color="$success">
          lädt
        </Text>
      </XStack>
    )
  }

  if (typeof percent !== 'number') return null

  const color = percent < 3 ? '$critical' : percent < 10 ? '$warning' : '$textSecondary'
  const iconColor = percent < 3 ? theme.critical?.val : percent < 10 ? theme.warning?.val : theme.textSecondary?.val
  const icon = percent < 10 ? 'battery-dead-outline' : percent < 60 ? 'battery-half-outline' : 'battery-full-outline'

  return (
    <XStack alignItems="center" gap="$4">
      <Ionicons name={icon} size={18} color={iconColor} />
      <Text fontFamily="$body" fontSize={13} color={color}>
        {percent} %
      </Text>
    </XStack>
  )
}
