import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { Pressable, type TextInputProps } from 'react-native'
import { Input, Text, useTheme, XStack, YStack } from 'tamagui'

type TextFieldProps = {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  error?: string
  secureTextEntry?: boolean
  editable?: boolean
  autoCapitalize?: TextInputProps['autoCapitalize']
  autoComplete?: TextInputProps['autoComplete']
  textContentType?: TextInputProps['textContentType']
  keyboardType?: TextInputProps['keyboardType']
  inputRef?: { current: { focus: () => void } | null }
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secureTextEntry,
  editable = true,
  autoCapitalize,
  autoComplete,
  textContentType,
  keyboardType,
  inputRef,
}: TextFieldProps) {
  const theme = useTheme()
  const [isFocused, setIsFocused] = useState(false)
  const [isRevealed, setIsRevealed] = useState(false)
  const hasToggle = Boolean(secureTextEntry)

  const borderColor = error ? '$critical' : isFocused ? '$accent' : '$border'

  return (
    <YStack gap="$4">
      <Text fontFamily="$body" fontSize={13} fontWeight="600" color="$textPrimary">
        {label}
      </Text>
      <XStack
        alignItems="center"
        borderWidth={1}
        borderRadius="$12"
        borderColor={borderColor}
        backgroundColor="$background"
        paddingHorizontal="$12"
      >
        <Input
          ref={(instance) => {
            if (inputRef) {
              inputRef.current = instance as unknown as { focus: () => void } | null
            }
          }}
          flex={1}
          // Tamagui 3: Input bringt eigene Fläche und Rahmen mit; der äußere Rahmen übernimmt beides.
          backgroundColor="transparent"
          borderWidth={0}
          // Tamagui 3 setzt sonst den Radius der Größenstufe ("md"). Den Token gibt es bei uns nicht,
          // der String landet nativ im TextInput und Android wirft eine JSApplicationIllegalArgumentException.
          borderRadius={0}
          outlineWidth={0}
          fontFamily="$body"
          fontSize={16}
          color="$textPrimary"
          placeholderTextColor="$textSecondary"
          paddingVertical="$12"
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          secureTextEntry={hasToggle && !isRevealed}
          // Web: Tamagui 3 verwirft secureTextEntry dort, verdeckt wird nur über type="password".
          type={hasToggle && !isRevealed ? 'password' : undefined}
          disabled={!editable}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          textContentType={textContentType}
          keyboardType={keyboardType}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
        {hasToggle ? (
          <Pressable
            onPress={() => setIsRevealed((current) => !current)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={isRevealed ? 'Passwort verbergen' : 'Passwort anzeigen'}
          >
            <Ionicons
              name={isRevealed ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={theme.textSecondary?.val}
            />
          </Pressable>
        ) : null}
      </XStack>
      {error ? (
        <Text fontFamily="$body" fontSize={12} color="$critical">
          {error}
        </Text>
      ) : null}
    </YStack>
  )
}
