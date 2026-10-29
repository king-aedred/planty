import { Text, XStack, YStack } from 'tamagui'
import { PlantAvatar } from './plant-avatar'

export type PlantCharacter = 'happy' | 'grumpy' | 'neutral'

export const CHARACTERS: { value: PlantCharacter; label: string; description: string; color: string; soft: string }[] = [
  { value: 'happy', label: 'Fröhlich', description: 'Durch und durch optimistisch', color: '$characterHappy', soft: '$characterHappySoft' },
  { value: 'grumpy', label: 'Grummelig', description: 'Nimmt kein Blatt vor den Mund', color: '$characterGrumpy', soft: '$characterGrumpySoft' },
  { value: 'neutral', label: 'Gelassen', description: 'Alles, bloß kein Drama', color: '$characterNeutral', soft: '$characterNeutralSoft' },
]

// Persönlichkeit wählen: drei Karten mit Avatar, aktive Karte in ihrer Charakterfarbe.
export function CharacterPicker({ value, onChange }: { value: PlantCharacter | null; onChange: (value: PlantCharacter) => void }) {
  return (
    <XStack gap="$8">
      {CHARACTERS.map((option) => {
        const isActive = value === option.value
        return (
          <YStack
            key={option.value}
            role="radio"
            aria-checked={isActive}
            flex={1}
            onPress={() => onChange(option.value)}
            alignItems="center"
            gap="$6"
            paddingVertical="$16"
            paddingHorizontal="$4"
            borderRadius="$16"
            borderWidth={1}
            borderColor={isActive ? option.color : '$border'}
            backgroundColor={isActive ? option.soft : '$surface press:$surfaceElevated'}
          >
            <PlantAvatar mood={option.value} status="success" size={52} />
            <Text fontFamily="$body" fontWeight="700" fontSize={14} color={isActive ? option.color : '$textPrimary'}>
              {option.label}
            </Text>
            <Text fontFamily="$body" fontSize={11} color="$textSecondary" textAlign="center">
              {option.description}
            </Text>
          </YStack>
        )
      })}
    </XStack>
  )
}
