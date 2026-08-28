import type { ReactNode } from 'react'
import { ActivityIndicator } from 'react-native'
import { Text, useTheme, View } from 'tamagui'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

type ButtonProps = {
  children: ReactNode
  onPress: () => void
  variant?: ButtonVariant
  disabled?: boolean
  loading?: boolean
}

export function Button({ children, onPress, variant = 'primary', disabled, loading }: ButtonProps) {
  const theme = useTheme()
  const isDisabled = Boolean(disabled || loading)

  const backgroundColor = variant === 'primary' ? '$accent' : 'transparent'
  const borderColor = variant === 'secondary' ? '$border' : 'transparent'
  const textColor = variant === 'primary' ? '$textOnAccent' : '$textPrimary'
  const spinnerColor = variant === 'primary' ? theme.textOnAccent.val : theme.textPrimary.val

  return (
    <View
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      backgroundColor={backgroundColor}
      borderWidth={variant === 'secondary' ? 1 : 0}
      borderColor={borderColor}
      borderRadius="$8"
      paddingVertical="$12"
      paddingHorizontal="$16"
      alignItems="center"
      justifyContent="center"
      opacity={isDisabled ? 0.5 : 1}
      pressStyle={isDisabled ? undefined : { opacity: 0.85 }}
      transition="quick"
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <Text fontFamily="$body" fontWeight="700" fontSize={16} color={textColor}>
          {children}
        </Text>
      )}
    </View>
  )
}
