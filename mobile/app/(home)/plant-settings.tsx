import { api } from '../../../convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Alert } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { PlantAvatar } from '../../components/plants/plant-avatar'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { EmptyState } from '../../components/ui/empty-state'
import { Screen } from '../../components/ui/screen'
import { ScreenHeader } from '../../components/ui/screen-header'
import { SectionLabel } from '../../components/ui/section-label'
import { Stepper } from '../../components/ui/stepper'
import { TextField } from '../../components/ui/text-field'

type PlantCharacter = 'happy' | 'grumpy' | 'neutral'

const characterOptions: { value: PlantCharacter; label: string; color: string; soft: string }[] = [
  { value: 'happy', label: 'Fröhlich', color: '$characterHappy', soft: '$characterHappySoft' },
  { value: 'grumpy', label: 'Grummelig', color: '$characterGrumpy', soft: '$characterGrumpySoft' },
  { value: 'neutral', label: 'Gelassen', color: '$characterNeutral', soft: '$characterNeutralSoft' },
]

type ThresholdConfig = {
  key: 'moisture_threshold' | 'temperature_threshold_min' | 'temperature_threshold_max' | 'light_threshold_min' | 'light_threshold_max'
  label: string
  min: number
  max: number
  unit: string
  defaultValue: number
}

const thresholdConfigs: ThresholdConfig[] = [
  { key: 'moisture_threshold', label: 'Feuchtigkeit', min: 0, max: 100, unit: '%', defaultValue: 30 },
  { key: 'temperature_threshold_min', label: 'Temperatur Min', min: 0, max: 40, unit: '°C', defaultValue: 15 },
  { key: 'temperature_threshold_max', label: 'Temperatur Max', min: 0, max: 40, unit: '°C', defaultValue: 28 },
  { key: 'light_threshold_min', label: 'Licht Min', min: 0, max: 2000, unit: 'Lux', defaultValue: 200 },
  { key: 'light_threshold_max', label: 'Licht Max', min: 0, max: 2000, unit: 'Lux', defaultValue: 800 },
]

export default function PlantSettingsScreen() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user } = useUser()
  const router = useRouter()
  const params = useLocalSearchParams<{ plant_id?: string }>()

  const clerkId = user?.id ?? ''
  const plants = useQuery(api.plants.getAllPlantsByClerkId, clerkId ? { clerk_id: clerkId } : 'skip')
  const updatePlantSettings = useMutation(api.plants.updatePlantSettings)
  const updatePlantCharacter = useMutation(api.plants.updatePlantCharacter)

  const [name, setName] = useState('')
  const [selectedCharacter, setSelectedCharacter] = useState<PlantCharacter>('neutral')
  const [values, setValues] = useState<Record<ThresholdConfig['key'], string>>({
    moisture_threshold: '30',
    temperature_threshold_min: '15',
    temperature_threshold_max: '28',
    light_threshold_min: '200',
    light_threshold_max: '800',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isCharacterSaving, setIsCharacterSaving] = useState(false)

  const plant = useMemo(() => {
    const plantId = typeof params.plant_id === 'string' ? params.plant_id : ''

    return plants?.find((entry) => String(entry._id) === plantId) ?? null
  }, [params.plant_id, plants])

  useEffect(() => {
    if (!plant) {
      return
    }

    setName(plant.name)
    setSelectedCharacter(plant.character ?? 'neutral')
    setValues({
      moisture_threshold: String(plant.moisture_threshold ?? 30),
      temperature_threshold_min: String(plant.temperature_threshold_min ?? 15),
      temperature_threshold_max: String(plant.temperature_threshold_max ?? 28),
      light_threshold_min: String(plant.light_threshold_min ?? 200),
      light_threshold_max: String(plant.light_threshold_max ?? 800),
    })
  }, [plant])

  const goBack = () => {
    router.back()
  }

  const handleSave = async () => {
    if (!plant || isSaving) {
      return
    }

    setIsSaving(true)

    try {
      await updatePlantSettings({
        plant_id: plant._id,
        settings: {
          name: name.trim() || plant.name,
          moisture_threshold: parseValue(values.moisture_threshold, 0, 100, 30),
          temperature_threshold_min: parseValue(values.temperature_threshold_min, 0, 40, 15),
          temperature_threshold_max: parseValue(values.temperature_threshold_max, 0, 40, 28),
          light_threshold_min: parseValue(values.light_threshold_min, 0, 2000, 200),
          light_threshold_max: parseValue(values.light_threshold_max, 0, 2000, 800),
        },
      })

      Alert.alert('Gespeichert', 'Die Pflanzenschwellen wurden aktualisiert.')
    } catch (error) {
      Alert.alert('Fehler', error instanceof Error ? error.message : 'Einstellungen konnten nicht gespeichert werden')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCharacterChange = async (nextCharacter: PlantCharacter) => {
    if (!plant || nextCharacter === selectedCharacter || isCharacterSaving) {
      return
    }

    const previousCharacter = selectedCharacter

    setSelectedCharacter(nextCharacter)
    setIsCharacterSaving(true)

    try {
      await updatePlantCharacter({
        plant_id: plant._id,
        character: nextCharacter,
      })
    } catch (error) {
      setSelectedCharacter(previousCharacter)
      Alert.alert('Fehler', error instanceof Error ? error.message : 'Persönlichkeit konnte nicht gespeichert werden')
    } finally {
      setIsCharacterSaving(false)
    }
  }

  if (!plant) {
    return (
      <Screen>
        <ScreenHeader eyebrow="Einstellungen" title="Pflanze" onBack={goBack} withMenu={false} />
        <Card>
          <EmptyState icon="leaf-outline" title="Pflanze nicht gefunden" text="Vielleicht wurde sie gerade gelöscht." />
        </Card>
      </Screen>
    )
  }

  return (
    <Screen scroll>
      <ScreenHeader eyebrow="Einstellungen" title={plant.name} onBack={goBack} withMenu={false} />

      <Card>
        <SectionLabel>Pflanze</SectionLabel>
        <TextField label="Name" value={name} onChangeText={setName} placeholder="Pflanzenname" autoCapitalize="words" />
      </Card>

      <Card>
        <SectionLabel>Persönlichkeit</SectionLabel>
        <Text fontFamily="$body" fontSize={13} lineHeight="$3" color="$textSecondary">
          So schreibt dir deine Pflanze ihre Nachrichten.
        </Text>
        <XStack gap="$8">
          {characterOptions.map((option) => {
            const isActive = selectedCharacter === option.value
            return (
              <YStack
                key={option.value}
                role="radio"
                aria-checked={isActive}
                flex={1}
                onPress={isCharacterSaving ? undefined : () => void handleCharacterChange(option.value)}
                alignItems="center"
                gap="$8"
                paddingVertical="$12"
                borderRadius="$16"
                borderWidth={1}
                borderColor={isActive ? option.color : '$border'}
                backgroundColor={isActive ? option.soft : '$surface press:$surfaceElevated'}
              >
                <PlantAvatar mood={option.value} status="success" />
                <Text fontFamily="$body" fontWeight="600" fontSize={13} color={isActive ? option.color : '$textSecondary'}>
                  {option.label}
                </Text>
              </YStack>
            )
          })}
        </XStack>
      </Card>

      <Card>
        <SectionLabel>Schwellenwerte</SectionLabel>
        {thresholdConfigs.map((config) => {
          const numericValue = clampNumber(Number(values[config.key]), config.min, config.max, config.defaultValue)
          return (
            <YStack key={config.key} gap="$8">
              <XStack justifyContent="space-between" alignItems="baseline">
                <Text fontFamily="$body" fontWeight="600" fontSize={14} color="$textPrimary">
                  {config.label}
                </Text>
                <Text fontFamily="$body" fontSize={13} color="$textSecondary">
                  {numericValue} {config.unit}
                </Text>
              </XStack>
              <Stepper
                value={numericValue}
                min={config.min}
                max={config.max}
                onChange={(nextValue) => setValues((current) => ({ ...current, [config.key]: String(nextValue) }))}
              />
            </YStack>
          )
        })}
      </Card>

      <Button onPress={() => void handleSave()} loading={isSaving}>
        Speichern
      </Button>
    </Screen>
  )
}

function parseValue(value: string, min: number, max: number, defaultValue: number) {
  return clampNumber(Number(value), min, max, defaultValue)
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.round(value)))
}
