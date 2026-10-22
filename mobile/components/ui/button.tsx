import type { ReactNode } from 'react'
import { ActivityIndicator } from 'react-native'
import { Text, useTheme, View } from 'tamagui'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

type ButtonProps = {
  children: ReactNode
  onPress: () => void
  // primary: einzige Stelle mit Akzentfläche. secondary: Rahmen. ghost: nur Text in Akzentfarbe.
  // danger: zerstörende Aktion (z. B. Sensor entfernen), Text in Fehlerfarbe.
  variant?: ButtonVariant
  disabled?: boolean
  loading?: boolean
}

// Tamagui 3: Zustände stehen im Wert, z. B. "$accent press:$accentPress" (pressStyle gibt es nicht mehr).
const frame = {
  primary: { backgroundColor: '$accent press:$accentPress', borderColor: 'transparent', text: '$textOnAccent' },
  secondary: { backgroundColor: 'transparent press:$surfaceElevated', borderColor: '$borderStrong', text: '$textPrimary' },
  ghost: { backgroundColor: 'transparent press:$accentSoft', borderColor: 'transparent', text: '$accentText' },
  danger: { backgroundColor: 'transparent press:$criticalSoft', borderColor: '$border', text: '$critical' },
} as const

export function Button({ children, onPress, variant = 'primary', disabled, loading }: ButtonProps) {
  const theme = useTheme()
  const isDisabled = Boolean(disabled || loading)
  const style = frame[variant]
  const spinnerColor = variant === 'primary' ? theme.textOnAccent?.val : theme.textPrimary?.val

  return (
    <View
      role="button"
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      backgroundColor={isDisabled ? (variant === 'primary' ? '$accent' : 'transparent') : style.backgroundColor}
      borderWidth={1}
      borderColor={style.borderColor}
      borderRadius="$12"
      minHeight={46}
      paddingVertical="$12"
      paddingHorizontal="$16"
      alignItems="center"
      justifyContent="center"
      opacity={isDisabled ? 0.45 : 1}
      transition="quick"
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <Text fontFamily="$body" fontWeight="600" fontSize={15} color={style.text}>
          {children}
        </Text>
      )}
    </View>
  )
}
