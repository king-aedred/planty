import Ionicons from '@expo/vector-icons/Ionicons'
import type { ReactNode } from 'react'
import { Text, useTheme, XStack, YStack } from 'tamagui'

type ListRowProps = {
  title: string
  subtitle?: string
  // Links, z. B. Icon oder Avatar.
  leading?: ReactNode
  // Rechts, z. B. StatusBadge. Bei onPress folgt zusätzlich ein Pfeil.
  trailing?: ReactNode
  onPress?: () => void
  // Trennlinie oben (für Zeilen 2 bis n in einer Karte).
  divider?: boolean
}

// Listenzeile für Karten: Titel, Untertitel, optional Inhalt links/rechts und Pfeil.
export function ListRow({ title, subtitle, leading, trailing, onPress, divider = false }: ListRowProps) {
  const theme = useTheme()

  return (
    <XStack
      role={onPress ? 'button' : undefined}
      onPress={onPress}
      alignItems="center"
      gap="$12"
      paddingVertical="$12"
      paddingHorizontal="$12"
      borderTopWidth={divider ? 1 : 0}
      borderColor="$border"
      backgroundColor={onPress ? 'transparent press:$surfaceElevated' : 'transparent'}
    >
      {leading}
      <YStack flex={1} gap="$2">
        <Text fontFamily="$body" fontWeight="600" fontSize={15} color="$textPrimary" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text fontFamily="$body" fontSize={13} color="$textSecondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </YStack>
      {/* Eigene Zeile, damit Pillen mit alignSelf (Badge) mittig sitzen. */}
      {trailing ? <XStack alignItems="center">{trailing}</XStack> : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={theme.textSecondary?.val} /> : null}
    </XStack>
  )
}
