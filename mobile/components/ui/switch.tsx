import { useEffect } from 'react'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { YStack } from 'tamagui'

type SwitchProps = {
  value: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  label?: string
}

// Ein/Aus-Schalter: Fläche in Akzentfarbe, wenn an; der Knopf gleitet zur Seite.
export function Switch({ value, onChange, disabled = false, label }: SwitchProps) {
  const position = useSharedValue(value ? 1 : 0)

  useEffect(() => {
    position.value = withTiming(value ? 1 : 0, { duration: 180, easing: Easing.out(Easing.cubic) })
  }, [position, value])

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: position.value * 20 }] }))

  return (
    <YStack
      role="switch"
      aria-checked={value}
      aria-label={label}
      aria-disabled={disabled}
      onPress={disabled ? undefined : () => onChange(!value)}
      width={48}
      height={28}
      borderRadius="$999"
      padding={3}
      backgroundColor={value ? '$accent' : '$surfaceHigh'}
      opacity={disabled ? 0.45 : 1}
      justifyContent="center"
    >
      <Animated.View style={knobStyle}>
        <YStack width={22} height={22} borderRadius="$999" backgroundColor="$textOnAccent" />
      </Animated.View>
    </YStack>
  )
}
