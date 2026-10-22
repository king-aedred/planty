import Ionicons from '@expo/vector-icons/Ionicons'
import { Text, useTheme, XStack } from 'tamagui'

type ToggleChipProps = {
  label: string
  checked: boolean
  onPress: () => void
  disabled?: boolean
  // Zusatz in Klammern, z. B. "kommt bald"
  hint?: string
}

// An/Aus-Pille für Mehrfachauswahl. Aktiv: Akzentrahmen, gedämpfte Akzentfläche, Häkchen.
export function ToggleChip({ label, checked, onPress, disabled = false, hint }: ToggleChipProps) {
  const theme = useTheme()

  return (
    <XStack
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled}
      onPress={disabled ? undefined : onPress}
      alignItems="center"
      gap="$6"
      paddingVertical="$8"
      paddingHorizontal="$12"
      borderRadius="$999"
      borderWidth={1}
      borderColor={checked ? '$accent' : '$border'}
      backgroundColor={checked ? '$accentSoft' : disabled ? 'transparent' : 'transparent press:$surfaceElevated'}
      opacity={disabled ? 0.5 : 1}
    >
      {checked ? <Ionicons name="checkmark" size={14} color={theme.accentText?.val} /> : null}
      <Text fontFamily="$body" fontWeight="600" fontSize={13} color={checked ? '$accentText' : '$textSecondary'}>
        {label}
        {hint ? ` (${hint})` : ''}
      </Text>
    </XStack>
  )
}
