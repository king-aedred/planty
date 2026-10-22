import Ionicons from '@expo/vector-icons/Ionicons'
import { Text, useTheme, XStack, YStack } from 'tamagui'

type ChoiceCardProps = {
  title: string
  description?: string
  onPress: () => void
  // Mit Wert: Auswahl (Auswahlpunkt, aktiv = Akzentrahmen). Ohne: Navigation (Pfeil).
  selected?: boolean
}

// Antippbare Karte für Auswahl aus mehreren Optionen oder als Einstieg in einen Schritt.
export function ChoiceCard({ title, description, onPress, selected }: ChoiceCardProps) {
  const theme = useTheme()
  const isSelectable = selected !== undefined

  return (
    <XStack
      role={isSelectable ? 'radio' : 'button'}
      aria-checked={isSelectable ? selected : undefined}
      onPress={onPress}
      alignItems="center"
      gap="$12"
      padding="$16"
      borderRadius="$16"
      borderWidth={1}
      borderColor={selected ? '$accent' : '$border'}
      backgroundColor={selected ? '$accentSoft' : '$surface press:$surfaceElevated'}
    >
      <YStack flex={1} gap="$4">
        <Text fontFamily="$body" fontWeight="600" fontSize={15} color="$textPrimary">
          {title}
        </Text>
        {description ? (
          <Text fontFamily="$body" fontSize={13} lineHeight="$3" color="$textSecondary">
            {description}
          </Text>
        ) : null}
      </YStack>
      {isSelectable ? (
        <YStack
          width={20}
          height={20}
          borderRadius="$999"
          borderWidth={2}
          borderColor={selected ? '$accentText' : '$outline'}
          alignItems="center"
          justifyContent="center"
        >
          {selected ? <YStack width={10} height={10} borderRadius="$999" backgroundColor="$accentText" /> : null}
        </YStack>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={theme.outlineVariant?.val} />
      )}
    </XStack>
  )
}
