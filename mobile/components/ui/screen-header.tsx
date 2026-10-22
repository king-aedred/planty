import Ionicons from '@expo/vector-icons/Ionicons'
import type { ReactNode } from 'react'
import { Text, useTheme, XStack, YStack } from 'tamagui'

type ScreenHeaderProps = {
  title: string
  eyebrow?: string
  subtitle?: string
  // Links neben dem Titel, z. B. Glocke mit Zähler.
  leading?: ReactNode
  // Tippen auf den Titel (z. B. versteckte Geste).
  onTitlePress?: () => void
  // Zeigt links einen Zurück-Knopf.
  onBack?: () => void
  // false, wenn auf dem Screen kein Burger-Menü liegt (kein Platz rechts nötig).
  withMenu?: boolean
}

// Kopfzeile: kleine Überzeile, kompakter Titel. Rechts bleibt Platz für das Burger-Menü (44 px + Rand).
export function ScreenHeader({ title, eyebrow, subtitle, leading, onTitlePress, onBack, withMenu = true }: ScreenHeaderProps) {
  const theme = useTheme()

  return (
    <XStack alignItems="center" gap="$12" paddingRight={withMenu ? 56 : 0} minHeight={44}>
      {onBack ? (
        <YStack
          role="button"
          aria-label="Zurück"
          onPress={onBack}
          width={44}
          height={44}
          borderRadius="$999"
          borderWidth={1}
          borderColor="$border"
          backgroundColor="$surface press:$surfaceElevated"
          alignItems="center"
          justifyContent="center"
        >
          <Ionicons name="chevron-back" size={20} color={theme.textPrimary?.val} />
        </YStack>
      ) : null}
      {leading}
      <YStack flex={1} gap="$2" onPress={onTitlePress}>
        {eyebrow ? (
          <Text fontFamily="$body" fontWeight="600" fontSize={12} letterSpacing={1.2} textTransform="uppercase" color="$accentText">
            {eyebrow}
          </Text>
        ) : null}
        <Text fontFamily="$heading" fontSize={28} color="$textPrimary" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text fontFamily="$body" fontSize={14} color="$textSecondary">
            {subtitle}
          </Text>
        ) : null}
      </YStack>
    </XStack>
  )
}
