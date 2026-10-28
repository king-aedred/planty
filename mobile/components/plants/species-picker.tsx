import Ionicons from '@expo/vector-icons/Ionicons'
import { Text, useTheme, XStack, YStack } from 'tamagui'
import { FadeIn } from '../ui/fade-in'
import { TextField } from '../ui/text-field'

export type Species = { id: string; common_name: string; name: string }

type SpeciesPickerProps = {
  search: string
  onSearchChange: (value: string) => void
  results: Species[]
  selected: Species | null
  onSelect: (species: Species) => void
  onManualEntry: () => void
  // Eigene Art übernommen (Suchtext gilt als Art): Liste zu, Bestätigung darunter.
  manual?: boolean
}

const MAX_RESULTS = 5

// Pflanzenart suchen: Vorschläge schweben als Liste direkt unter dem Feld (wirkt wie ein Element) und
// verdrängen nichts darunter. Die umgebende Card braucht dafür allowOverflow.
// Die gewählte Art steht im Feld, ihr botanischer Name als Bestätigung darunter.
export function SpeciesPicker({ search, onSearchChange, results, selected, onSelect, onManualEntry, manual = false }: SpeciesPickerProps) {
  const theme = useTheme()
  const query = search.trim()
  const isOpen = !selected && !manual && query.length > 0

  return (
    <YStack position="relative" zIndex={20}>
      <TextField
        label="Pflanzenart"
        value={selected ? selected.common_name : search}
        onChangeText={onSearchChange}
        autoCapitalize="words"
        attached={isOpen}
      />

      {isOpen ? (
        <YStack position="absolute" top="100%" left={0} right={0} zIndex={20}>
          <FadeIn duration={200} offset={4}>
            <YStack
              borderWidth={1}
              borderTopWidth={0}
              borderColor="$accent"
              borderBottomLeftRadius="$12"
              borderBottomRightRadius="$12"
              backgroundColor="$background"
              overflow="hidden"
              boxShadow="0 12px 24px rgba(0,0,0,0.45)"
            >
              {results.slice(0, MAX_RESULTS).map((species) => (
                <XStack
                  key={species.id}
                  role="button"
                  onPress={() => onSelect(species)}
                  alignItems="baseline"
                  gap="$8"
                  paddingVertical="$12"
                  paddingHorizontal="$12"
                  borderTopWidth={1}
                  borderColor="$border"
                  backgroundColor="transparent press:$surfaceElevated"
                >
                  <Text fontFamily="$body" fontWeight="600" fontSize={15} color="$textPrimary">
                    {species.common_name}
                  </Text>
                  <Text flex={1} fontFamily="$body" fontSize={12} color="$textSecondary" numberOfLines={1}>
                    {species.name}
                  </Text>
                </XStack>
              ))}
              <XStack
                alignItems="center"
                justifyContent="space-between"
                gap="$8"
                paddingVertical="$12"
                paddingHorizontal="$12"
                borderTopWidth={results.length > 0 ? 1 : 0}
                borderColor="$border"
              >
                <Text flex={1} fontFamily="$body" fontSize={13} color="$textSecondary">
                  {results.length > 0 ? 'Nicht dabei?' : 'Kennen wir leider noch nicht.'}
                </Text>
                <Text fontFamily="$body" fontSize={13} fontWeight="700" color="$accentText" onPress={onManualEntry} role="button">
                  Trotzdem anlegen
                </Text>
              </XStack>
            </YStack>
          </FadeIn>
        </YStack>
      ) : null}

      {selected || (manual && query) ? (
        <XStack alignItems="center" gap="$6" marginTop="$6">
          <Ionicons name="checkmark-circle" size={16} color={theme.accentText?.val} />
          <Text fontFamily="$body" fontSize={13} color="$textSecondary">
            {selected ? selected.name : 'Pflegewerte kannst du später anpassen.'}
          </Text>
        </XStack>
      ) : null}
    </YStack>
  )
}
