import { Text, XStack } from 'tamagui'

type SegmentedControlProps<T extends string> = {
  options: { value: T; label: string }[]
  value: T | null
  onChange: (value: T) => void
}

// Auswahl aus wenigen Optionen. Die aktive Option ist der einzige Akzent (gedämpfte Fläche, Akzenttext).
export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <XStack backgroundColor="$surfaceElevated" borderRadius="$12" padding="$4" gap="$4">
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <XStack
            key={option.value}
            role="tab"
            aria-selected={isActive}
            flex={1}
            onPress={() => onChange(option.value)}
            alignItems="center"
            justifyContent="center"
            paddingVertical="$8"
            borderRadius="$8"
            backgroundColor={isActive ? '$surface' : 'transparent press:$surface'}
            borderWidth={1}
            borderColor={isActive ? '$accent' : 'transparent'}
          >
            <Text fontFamily="$body" fontWeight="600" fontSize={13} color={isActive ? '$accentText' : '$textSecondary'} numberOfLines={1}>
              {option.label}
            </Text>
          </XStack>
        )
      })}
    </XStack>
  )
}
