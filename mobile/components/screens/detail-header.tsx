import { Ionicons } from '@expo/vector-icons'
import type { ComponentProps, ReactNode } from 'react'
import { Text, useTheme, XStack, YStack } from 'tamagui'

type IconName = ComponentProps<typeof Ionicons>['name']

// Runder Icon-Knopf für Kopfzeilen (Zurück, Einstellungen, …).
export function HeaderIconButton({ icon, label, onPress, accent = false }: { icon: IconName; label: string; onPress: () => void; accent?: boolean }) {
  const theme = useTheme()
  return (
    <YStack
      role="button"
      aria-label={label}
      onPress={onPress}
      width={40}
      height={40}
      borderRadius="$999"
      backgroundColor={accent ? '$accent press:$accentPress' : '$surfaceElevated press:$surfaceHigh'}
      alignItems="center"
      justifyContent="center"
    >
      <Ionicons name={icon} size={20} color={accent ? theme.textOnAccent?.val : theme.textPrimary?.val} />
    </YStack>
  )
}

// Kopfzeile der Detailseiten: Zurück links, Titel mittig, optional eine Aktion rechts.
export function DetailHeader({ title, onBack, action }: { title: string; onBack: () => void; action?: ReactNode }) {
  return (
    <XStack alignItems="center" gap="$12" minHeight={44}>
      <HeaderIconButton icon="chevron-back" label="Zurück" onPress={onBack} />
      <Text flex={1} textAlign="center" fontFamily="$body" fontWeight="700" fontSize={16} color="$textPrimary" numberOfLines={1}>
        {title}
      </Text>
      {action ?? <YStack width={40} />}
    </XStack>
  )
}
