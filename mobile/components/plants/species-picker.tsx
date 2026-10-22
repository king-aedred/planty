import Ionicons from '@expo/vector-icons/Ionicons'
import { Text, useTheme, XStack, YStack } from 'tamagui'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { ListRow } from '../ui/list-row'
import { TextField } from '../ui/text-field'

export type Species = { id: string; common_name: string; name: string }

type SpeciesPickerProps = {
  search: string
  onSearchChange: (value: string) => void
  results: Species[]
  selected: Species | null
  onSelect: (species: Species) => void
  onManualEntry: () => void
}

// Pflanzenart suchen und wählen. Die gewählte Art ist der aktive Zustand (Akzentrahmen).
export function SpeciesPicker({ search, onSearchChange, results, selected, onSelect, onManualEntry }: SpeciesPickerProps) {
  const theme = useTheme()

  return (
    <YStack gap="$12">
      <TextField label="Pflanzenart" value={search} onChangeText={onSearchChange} placeholder="z. B. Monstera" autoCapitalize="words" />

      {selected ? (
        <XStack
          alignItems="center"
          gap="$12"
          padding="$12"
          borderRadius="$12"
          borderWidth={1}
          borderColor="$accent"
          backgroundColor="$accentSoft"
        >
          <YStack flex={1} gap="$2">
            <Text fontFamily="$body" fontWeight="600" fontSize={15} color="$textPrimary">
              {selected.common_name}
            </Text>
            <Text fontFamily="$body" fontSize={13} color="$textSecondary">
              {selected.name}
            </Text>
          </YStack>
          <Ionicons name="checkmark-circle" size={22} color={theme.accentText?.val} />
        </XStack>
      ) : results.length > 0 ? (
        <Card dense>
          {results.map((species, index) => (
            <ListRow key={species.id} divider={index > 0} title={species.common_name} subtitle={species.name} onPress={() => onSelect(species)} />
          ))}
        </Card>
      ) : null}

      {!selected && search.trim() && results.length === 0 ? (
        <Button variant="ghost" onPress={onManualEntry}>
          Nicht dabei? Namen selbst eingeben
        </Button>
      ) : null}
    </YStack>
  )
}
