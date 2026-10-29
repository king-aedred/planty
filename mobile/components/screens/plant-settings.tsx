import { CharacterPicker, type PlantCharacter } from '@/components/plants/character-picker'
import type { DashboardPlant } from '@/components/plants/plant-dashboard'
import { type Species, SpeciesPicker } from '@/components/plants/species-picker'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FadeIn } from '@/components/ui/fade-in'
import { SectionLabel } from '@/components/ui/section-label'
import { Stepper } from '@/components/ui/stepper'
import { TextField } from '@/components/ui/text-field'
import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, useTheme, XStack, YStack } from 'tamagui'
import type { DemoSensor } from './demo-data'
import { DetailHeader } from './detail-header'

type Thresholds = { moisture: number; temperatureMin: number; temperatureMax: number; lightMin: number; lightMax: number }

type PlantSettingsProps = {
  plant: DashboardPlant
  sensor: DemoSensor | null
  thresholds: Thresholds
  searchSpecies: (search: string) => Species[]
  onBack: () => void
  onSave: () => void
  onDelete: () => void
  onPairSensor: () => void
  onRemoveSensor: () => void
  ignoreReducedMotion?: boolean
}

function ThresholdRow({ label, unit, value, min, max, step, onChange }: { label: string; unit: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <YStack gap="$6">
      <XStack justifyContent="space-between" alignItems="baseline">
        <Text fontFamily="$body" fontWeight="600" fontSize={14} color="$textPrimary">
          {label}
        </Text>
        <Text fontFamily="$body" fontSize={13} color="$textSecondary">
          {value} {unit}
        </Text>
      </XStack>
      <Stepper value={value} min={min} max={max} step={step} onChange={onChange} />
    </YStack>
  )
}

// Pflanzen-Einstellungen (Screen 8): Name, Art, Persönlichkeit, Pflegewerte, Sensor, Löschen.
export function PlantSettingsScreen({
  plant,
  sensor,
  thresholds: initialThresholds,
  searchSpecies,
  onBack,
  onSave,
  onDelete,
  onPairSensor,
  onRemoveSensor,
  ignoreReducedMotion,
}: PlantSettingsProps) {
  const theme = useTheme()
  const [name, setName] = useState(plant.name)
  const [speciesSearch, setSpeciesSearch] = useState('')
  const [species, setSpecies] = useState<Species | null>(plant.speciesName ? { id: 'current', common_name: plant.speciesName, name: plant.speciesName } : null)
  const [isManual, setIsManual] = useState(false)
  const [character, setCharacter] = useState<PlantCharacter>(plant.character ?? 'neutral')
  const [thresholds, setThresholds] = useState(initialThresholds)
  const [isDirty, setIsDirty] = useState(false)
  const [sheet, setSheet] = useState<'delete' | 'remove-sensor' | null>(null)

  const change = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value)
    setIsDirty(true)
  }
  const setThreshold = (key: keyof Thresholds) => change((value: number) => setThresholds((current) => ({ ...current, [key]: value })))

  const section = (delay: number, children: React.ReactNode) => (
    <FadeIn delay={delay} duration={400} ignoreReducedMotion={ignoreReducedMotion}>
      {children}
    </FadeIn>
  )

  return (
    <YStack flex={1} backgroundColor="$background">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <DetailHeader title="Pflanze bearbeiten" onBack={onBack} />

          {section(
            0,
            <Card allowOverflow>
              <SectionLabel>Pflanze</SectionLabel>
              <TextField label="Name" value={name} onChangeText={change(setName)} autoCapitalize="words" />
              <SpeciesPicker
                search={speciesSearch}
                onSearchChange={(value) => {
                  setSpeciesSearch(value)
                  setSpecies(null)
                  setIsManual(false)
                  setIsDirty(true)
                }}
                results={species ? [] : searchSpecies(speciesSearch)}
                selected={species}
                onSelect={(selected) => {
                  setSpecies(selected)
                  setIsDirty(true)
                }}
                onManualEntry={() => {
                  setIsManual(true)
                  setIsDirty(true)
                }}
                manual={isManual}
              />
            </Card>,
          )}

          {section(
            60,
            <Card>
              <SectionLabel>Persönlichkeit</SectionLabel>
              <CharacterPicker value={character} onChange={change(setCharacter)} />
            </Card>,
          )}

          {section(
            120,
            <Card>
              <XStack justifyContent="space-between" alignItems="baseline">
                <SectionLabel>Pflegewerte</SectionLabel>
                <Text
                  fontFamily="$body"
                  fontSize={12}
                  fontWeight="700"
                  color="$accentText"
                  onPress={() => {
                    setThresholds(initialThresholds)
                    setIsDirty(true)
                  }}
                  role="button"
                >
                  Zurücksetzen
                </Text>
              </XStack>
              <Text fontFamily="$body" fontSize={13} color="$textSecondary">
                Ab hier meldet sich {name || 'deine Pflanze'}. Vorgabe kommt von der Art.
              </Text>
              <ThresholdRow label="Boden trocken unter" unit="%" value={thresholds.moisture} min={5} max={80} step={1} onChange={setThreshold('moisture')} />
              <ThresholdRow label="Zu kalt unter" unit="°C" value={thresholds.temperatureMin} min={0} max={30} step={1} onChange={setThreshold('temperatureMin')} />
              <ThresholdRow label="Zu warm über" unit="°C" value={thresholds.temperatureMax} min={15} max={45} step={1} onChange={setThreshold('temperatureMax')} />
              <ThresholdRow label="Zu dunkel unter" unit="lx" value={thresholds.lightMin} min={0} max={5000} step={100} onChange={setThreshold('lightMin')} />
            </Card>,
          )}

          {section(
            180,
            <Card>
              <SectionLabel>Sensor</SectionLabel>
              {sensor ? (
                <>
                  <XStack alignItems="center" gap="$12">
                    <Ionicons name="radio-outline" size={20} color={theme.accentText?.val} />
                    <Text flex={1} fontFamily="$body" fontWeight="600" fontSize={14} color="$textPrimary">
                      {sensor.name}
                    </Text>
                  </XStack>
                  <Button variant="secondary" onPress={() => setSheet('remove-sensor')}>
                    Sensor von dieser Pflanze lösen
                  </Button>
                </>
              ) : (
                <>
                  <Text fontFamily="$body" fontSize={14} color="$textSecondary">
                    Noch kein Sensor zugeordnet.
                  </Text>
                  <Button variant="secondary" onPress={onPairSensor}>
                    Sensor koppeln
                  </Button>
                </>
              )}
            </Card>,
          )}

          {section(
            240,
            <Button variant="danger" onPress={() => setSheet('delete')}>
              Pflanze löschen
            </Button>,
          )}
        </ScrollView>

        <YStack position="absolute" left={16} right={16} bottom={24}>
          <Button
            onPress={() => {
              setIsDirty(false)
              onSave()
            }}
            disabled={!isDirty || !name.trim()}
          >
            Speichern
          </Button>
        </YStack>
      </SafeAreaView>

      <BottomSheet visible={sheet !== null} onClose={() => setSheet(null)}>
        {sheet === 'delete' ? (
          <>
            <Text fontFamily="$heading" fontSize={24} color="$textPrimary">
              {plant.name} löschen?
            </Text>
            <Text fontFamily="$body" fontSize={14} lineHeight="$4" color="$textSecondary">
              Verlauf und Nachrichten gehen verloren. Der Sensor bleibt in deinem Konto und ist danach frei.
            </Text>
            <Button
              variant="danger"
              onPress={() => {
                setSheet(null)
                onDelete()
              }}
            >
              Endgültig löschen
            </Button>
            <Button variant="ghost" onPress={() => setSheet(null)}>
              Abbrechen
            </Button>
          </>
        ) : (
          <>
            <Text fontFamily="$heading" fontSize={24} color="$textPrimary">
              Sensor lösen?
            </Text>
            <Text fontFamily="$body" fontSize={14} lineHeight="$4" color="$textSecondary">
              {plant.name} bekommt dann keine Messwerte mehr. Den Sensor kannst du danach einer anderen Pflanze geben.
            </Text>
            <Button
              variant="danger"
              onPress={() => {
                setSheet(null)
                onRemoveSensor()
              }}
            >
              Sensor lösen
            </Button>
            <Button variant="ghost" onPress={() => setSheet(null)}>
              Abbrechen
            </Button>
          </>
        )}
      </BottomSheet>
    </YStack>
  )
}
