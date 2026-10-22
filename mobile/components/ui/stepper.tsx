import Ionicons from '@expo/vector-icons/Ionicons'
import { Input, useTheme, XStack, YStack } from 'tamagui'

type StepperProps = {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  step?: number
}

// Zahl mit Minus/Plus und direkter Eingabe; Werte bleiben zwischen min und max.
export function Stepper({ value, min, max, onChange, step = 1 }: StepperProps) {
  const theme = useTheme()
  const clamp = (next: number) => Math.min(max, Math.max(min, next))

  const stepButton = (icon: 'remove' | 'add', delta: number, label: string) => (
    <YStack
      role="button"
      aria-label={label}
      onPress={() => onChange(clamp(value + delta))}
      width={44}
      height={44}
      borderRadius="$999"
      backgroundColor="$surfaceElevated press:$surfaceHigh"
      alignItems="center"
      justifyContent="center"
    >
      <Ionicons name={icon} size={20} color={theme.textPrimary?.val} />
    </YStack>
  )

  return (
    <XStack alignItems="center" gap="$8">
      {stepButton('remove', -step, 'Weniger')}
      <Input
        flex={1}
        // Tamagui 3: Input bringt eigene Fläche und Rahmen mit; hier explizit gesetzt.
        backgroundColor="$background"
        borderWidth={1}
        borderColor="$border"
        borderRadius="$12"
        height={44}
        textAlign="center"
        fontFamily="$body"
        fontWeight="600"
        fontSize={16}
        color="$textPrimary"
        keyboardType="numeric"
        value={String(value)}
        onChangeText={(text) => {
          const parsed = Number(text.replace(',', '.'))
          if (Number.isFinite(parsed)) onChange(clamp(parsed))
        }}
      />
      {stepButton('add', step, 'Mehr')}
    </XStack>
  )
}
