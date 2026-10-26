import { useEffect, useRef, useState } from 'react'
import { Pressable, TextInput } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated'
import { Text, XStack, YStack } from 'tamagui'

type CodeInputProps = {
  value: string
  onChangeText: (value: string) => void
  // Wird aufgerufen, sobald alle Ziffern eingegeben (oder eingefügt) sind.
  onComplete?: (code: string) => void
  length?: number
  // Bei jeder Erhöhung wackeln die Felder kurz (falscher Code).
  errorKey?: number
  disabled?: boolean
}

// Code-Eingabe mit einzelnen Ziffernfeldern. Darunter liegt ein unsichtbares Textfeld, das die Tastatur,
// Einfügen und das automatische Ausfüllen aus SMS/Mail übernimmt; die Felder zeigen nur dessen Inhalt.
export function CodeInput({ value, onChangeText, onComplete, length = 6, errorKey = 0, disabled = false }: CodeInputProps) {
  const inputRef = useRef<TextInput>(null)
  const [isFocused, setIsFocused] = useState(false)
  const shake = useSharedValue(0)

  useEffect(() => {
    if (errorKey === 0) {
      return
    }
    shake.value = withSequence(
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 60 }),
      withTiming(-6, { duration: 60 }),
      withTiming(6, { duration: 60 }),
      withTiming(0, { duration: 50 }),
    )
  }, [errorKey, shake])

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 400)
    return () => clearTimeout(timer)
  }, [])

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }))

  const handleChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, length)
    onChangeText(digits)
    if (digits.length === length) {
      onComplete?.(digits)
    }
  }

  const activeIndex = Math.min(value.length, length - 1)

  return (
    <Pressable onPress={() => inputRef.current?.focus()} disabled={disabled} accessibilityLabel="Bestätigungscode">
      <Animated.View style={shakeStyle}>
        <XStack gap="$8" justifyContent="center">
          {Array.from({ length }, (_, index) => {
            const isActive = isFocused && index === activeIndex && !disabled
            return (
              <YStack
                key={index}
                flex={1}
                maxWidth={52}
                height={56}
                borderRadius="$12"
                borderWidth={1}
                borderColor={isActive ? '$accent' : value[index] ? '$borderStrong' : '$border'}
                backgroundColor="$background"
                alignItems="center"
                justifyContent="center"
              >
                <Text fontFamily="$heading" fontSize={24} color="$textPrimary">
                  {value[index] ?? ''}
                </Text>
              </YStack>
            )
          })}
        </XStack>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          editable={!disabled}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={length}
          caretHidden
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, color: 'transparent' }}
        />
      </Animated.View>
    </Pressable>
  )
}
