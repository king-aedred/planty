import { api } from '../../../convex/_generated/api'
import { SpeciesPicker } from '../../components/plants/species-picker'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { ChoiceCard } from '../../components/ui/choice-card'
import { ErrorNotice } from '../../components/ui/error-notice'
import { Screen } from '../../components/ui/screen'
import { ScreenHeader } from '../../components/ui/screen-header'
import { SectionLabel } from '../../components/ui/section-label'
import { TextField } from '../../components/ui/text-field'
import { useMutation, useQuery } from 'convex/react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Alert } from 'react-native'
import { Text, YStack } from 'tamagui'

type Step = 'choice' | 'with-sensor' | 'without-sensor' | 'transfer'

export default function AddPlantScreen() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user } = useUser()
  const router = useRouter()
  const { device_id: preselectedDeviceId } = useLocalSearchParams<{ device_id?: string }>()

  const clerkId = user?.id ?? ''
  const [step, setStep] = useState<Step>('choice')
  const [plantName, setPlantName] = useState('')
  const [speciesSearch, setSpeciesSearch] = useState('')
  const [selectedSpecies, setSelectedSpecies] = useState<{
    id: string
    common_name: string
    name: string
  } | null>(null)
  const [manualPlantName, setManualPlantName] = useState('')
  const [isManualSpeciesEntry, setIsManualSpeciesEntry] = useState(false)
  const [deviceId, setDeviceId] = useState('')
  const [selectedSourcePlantId, setSelectedSourcePlantId] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const plants = useQuery(api.plants.getAllPlantsByClerkId, clerkId ? { clerk_id: clerkId } : 'skip')
  const sensors = useQuery(api.sensors.getSensorsByClerkId, clerkId ? {} : 'skip')
  const speciesResults = useQuery(api.plant_species.searchPlantSpecies, { search: speciesSearch }) ?? []
  const createPlant = useMutation(api.plants.createPlant)
  const transferSensor = useMutation(api.plants.transferSensor)
  const deletePlant = useMutation(api.plants.deletePlant)

  const freeSensors = useMemo(() => (sensors ?? []).filter((sensor) => !sensor.has_plant), [sensors])

  useEffect(() => {
    if (preselectedDeviceId) {
      setDeviceId(preselectedDeviceId)
      setStep('with-sensor')
    }
  }, [preselectedDeviceId])

  const plantsWithSensors = useMemo(
    () => (plants ?? []).filter((plant) => Boolean(plant.device_id ?? plant.sensor_id)),
    [plants],
  )

  const resetForm = () => {
    setPlantName('')
    setSpeciesSearch('')
    setSelectedSpecies(null)
    setManualPlantName('')
    setIsManualSpeciesEntry(false)
    setDeviceId('')
    setSelectedSourcePlantId('')
    setErrorMessage('')
    setStep('choice')
  }

  const goToPlantList = () => {
    router.replace('/(home)/(tabs)/plant-list')
  }

  const ensurePlantCreated = async (deviceIdValue?: string) => {
    return await createPlant({
      clerk_id: clerkId,
      ...(deviceIdValue ? { device_id: deviceIdValue } : {}),
      name: plantName.trim(),
    })
  }

  const handleSpeciesSearchChange = (value: string) => {
    setSpeciesSearch(value)
    setSelectedSpecies(null)
    setIsManualSpeciesEntry(false)
    setManualPlantName('')
  }

  const handleSelectSpecies = (species: { id: string; common_name: string; name: string }) => {
    setSelectedSpecies(species)
    setManualPlantName(species.common_name)
    setErrorMessage('')
    setIsManualSpeciesEntry(false)
  }

  const handleManualSpeciesEntry = () => {
    setSelectedSpecies(null)
    setManualPlantName('')
    setErrorMessage('')
    setIsManualSpeciesEntry(true)
  }

  const getCreatePlantName = () => {
    return selectedSpecies ? selectedSpecies.common_name.trim() : manualPlantName.trim()
  }

  const handleRegisterWithSensor = async () => {
    const trimmedPlantName = getCreatePlantName()
    const trimmedDeviceId = deviceId.trim()

    if (!clerkId || !trimmedPlantName || !trimmedDeviceId || isSubmitting) {
      return
    }

    setErrorMessage('')
    setIsSubmitting(true)

    try {
      await createPlant({
        clerk_id: clerkId,
        device_id: trimmedDeviceId,
        name: trimmedPlantName,
        ...(selectedSpecies ? { species_id: selectedSpecies.id } : {}),
      })
      Alert.alert(
        'Schwellenwerte eingesetzt ✅',
        selectedSpecies
          ? 'Pflanzenspezifische Schwellenwerte wurden automatisch eingesetzt. Du kannst sie jederzeit in den Pflanzen-Einstellungen anpassen.'
          : 'Wir nutzen allgemeine Standardwerte da wir deine Pflanze nicht kennen. Du kannst sie in den Pflanzen-Einstellungen anpassen.',
        [
          {
            text: 'Verstanden',
            onPress: () => {
              resetForm()
              goToPlantList()
            },
          },
        ],
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : ''

      if (message.includes('already registered')) {
        setErrorMessage('Dieser Sensor ist bereits registriert')
      } else {
        setErrorMessage('Pflanze konnte nicht registriert werden')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateWithoutSensor = async () => {
    const trimmedPlantName = getCreatePlantName()

    if (!clerkId || !trimmedPlantName || isSubmitting) {
      return
    }

    setErrorMessage('')
    setIsSubmitting(true)

    try {
      await createPlant({
        clerk_id: clerkId,
        name: trimmedPlantName,
        ...(selectedSpecies ? { species_id: selectedSpecies.id } : {}),
      })
      Alert.alert(
        'Schwellenwerte eingesetzt ✅',
        selectedSpecies
          ? 'Pflanzenspezifische Schwellenwerte wurden automatisch eingesetzt. Du kannst sie jederzeit in den Pflanzen-Einstellungen anpassen.'
          : 'Wir nutzen allgemeine Standardwerte da wir deine Pflanze nicht kennen. Du kannst sie in den Pflanzen-Einstellungen anpassen.',
        [
          {
            text: 'Verstanden',
            onPress: () => {
              resetForm()
              goToPlantList()
            },
          },
        ],
      )
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Pflanze konnte nicht angelegt werden')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleTransferSensor = async (deleteSourcePlant: boolean) => {
    const trimmedPlantName = plantName.trim()

    if (!clerkId || !trimmedPlantName || !selectedSourcePlantId || isSubmitting) {
      return
    }

    const sourcePlant = plantsWithSensors.find((plant) => String(plant._id) === selectedSourcePlantId)
    const sourceDeviceId = sourcePlant?.device_id ?? sourcePlant?.sensor_id ?? ''

    if (!sourcePlant || !sourceDeviceId) {
      setErrorMessage('Die ausgewählte Pflanze hat keinen Sensor mehr')
      return
    }

    setErrorMessage('')
    setIsSubmitting(true)

    try {
      const targetPlantId = await ensurePlantCreated()
      await transferSensor({
        from_plant_id: sourcePlant._id,
        to_plant_id: targetPlantId,
        device_id: sourceDeviceId,
      })

      if (deleteSourcePlant) {
        await deletePlant({ plant_id: sourcePlant._id })
      }

      resetForm()
      goToPlantList()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Sensor konnte nicht übertragen werden')
    } finally {
      setIsSubmitting(false)
    }
  }

  const promptTransferAction = () => {
    if (!selectedSourcePlantId || isSubmitting) {
      return
    }

    const sourcePlant = plantsWithSensors.find((plant) => String(plant._id) === selectedSourcePlantId)
    const sourceDeviceId = sourcePlant?.device_id ?? sourcePlant?.sensor_id ?? ''

    if (!sourcePlant || !sourceDeviceId) {
      setErrorMessage('Bitte wähle eine Pflanze mit Sensor aus')
      return
    }

    Alert.alert(
      `Sensor ${sourceDeviceId} übertragen?`,
      `Sensor ${sourceDeviceId} von ${sourcePlant.name} übertragen?\n\nWas soll mit ${sourcePlant.name} passieren?`,
      [
        {
          text: 'Abbrechen',
          style: 'cancel',
        },
        {
          text: 'Pflanze löschen',
          style: 'destructive',
          onPress: () => {
            void handleTransferSensor(true)
          },
        },
        {
          text: 'Pflanze behalten (ohne Sensor)',
          onPress: () => {
            void handleTransferSensor(false)
          },
        },
      ],
    )
  }

  const canCreate = Boolean(selectedSpecies || (isManualSpeciesEntry && manualPlantName.trim()))

  const speciesPicker = (
    <SpeciesPicker
      search={speciesSearch}
      onSearchChange={handleSpeciesSearchChange}
      results={speciesResults}
      selected={selectedSpecies}
      onSelect={handleSelectSpecies}
      onManualEntry={handleManualSpeciesEntry}
    />
  )

  const manualNameField = isManualSpeciesEntry ? (
    <TextField label="Pflanzenname" value={manualPlantName} onChangeText={setManualPlantName} placeholder="z. B. Monstera" autoCapitalize="words" />
  ) : null

  return (
    <Screen scroll>
      <ScreenHeader
        eyebrow="Callgreen"
        title="Pflanze hinzufügen"
        subtitle={step === 'choice' ? 'Hast du einen Sensor für diese Pflanze?' : undefined}
        onBack={() => (step === 'choice' ? router.back() : setStep(step === 'transfer' ? 'without-sensor' : 'choice'))}
        withMenu={false}
      />

      {step === 'choice' ? (
        <YStack gap="$8">
          <ChoiceCard title="Ja, ich habe einen Sensor" description="Pflanze anlegen und direkt mit einem freien Sensor verbinden." onPress={() => setStep('with-sensor')} />
          <ChoiceCard title="Nein, ohne Sensor" description="Pflanze anlegen und später einen Sensor zuweisen." onPress={() => setStep('without-sensor')} />
        </YStack>
      ) : null}

      {step === 'with-sensor' ? (
        <>
          <Card>
            <SectionLabel>Pflanze</SectionLabel>
            {speciesPicker}
            {manualNameField}
          </Card>

          <Card>
            <SectionLabel>Freier Sensor</SectionLabel>
            {freeSensors.length > 0 ? (
              <YStack gap="$8">
                {freeSensors.map((sensor) => (
                  <ChoiceCard
                    key={String(sensor._id)}
                    title={sensor.device_id}
                    description="Bereit für eine Pflanze"
                    selected={deviceId === sensor.device_id}
                    onPress={() => setDeviceId(sensor.device_id)}
                  />
                ))}
              </YStack>
            ) : (
              <Text fontFamily="$body" fontSize={14} lineHeight="$4" color="$textSecondary">
                Keine freien Sensoren vorhanden. Du kannst die Pflanze ohne Sensor anlegen.
              </Text>
            )}
          </Card>

          {errorMessage ? <ErrorNotice message={errorMessage} /> : null}

          <Button
            onPress={() => void handleRegisterWithSensor()}
            disabled={!canCreate || !deviceId.trim() || freeSensors.length === 0}
            loading={isSubmitting}
          >
            Pflanze anlegen
          </Button>
        </>
      ) : null}

      {step === 'without-sensor' ? (
        <>
          <Card>
            <SectionLabel>Pflanze</SectionLabel>
            <Text fontFamily="$body" fontSize={14} lineHeight="$4" color="$textSecondary">
              Ohne Sensor gibt es keine Messwerte. Du kannst später einen Sensor zuweisen.
            </Text>
            {speciesPicker}
            {manualNameField}
          </Card>

          {errorMessage ? <ErrorNotice message={errorMessage} /> : null}

          <Button onPress={() => void handleCreateWithoutSensor()} disabled={!canCreate} loading={isSubmitting}>
            Pflanze ohne Sensor anlegen
          </Button>
          <Button variant="ghost" onPress={() => setStep('transfer')}>
            Sensor von einer anderen Pflanze übertragen
          </Button>
        </>
      ) : null}

      {step === 'transfer' ? (
        <>
          <Card>
            <SectionLabel>Sensor übertragen</SectionLabel>
            <Text fontFamily="$body" fontSize={14} lineHeight="$4" color="$textSecondary">
              Wähle eine Pflanze, deren Sensor die neue Pflanze übernehmen soll.
            </Text>
            <TextField label="Name der neuen Pflanze" value={plantName} onChangeText={setPlantName} placeholder="z. B. Monstera" autoCapitalize="words" />
          </Card>

          <Card>
            <SectionLabel>Von welcher Pflanze?</SectionLabel>
            {plantsWithSensors.length > 0 ? (
              <YStack gap="$8">
                {plantsWithSensors.map((plant) => {
                  const plantId = String(plant._id)
                  return (
                    <ChoiceCard
                      key={plantId}
                      title={plant.name}
                      description={plant.device_id ?? plant.sensor_id ?? ''}
                      selected={selectedSourcePlantId === plantId}
                      onPress={() => setSelectedSourcePlantId(plantId)}
                    />
                  )
                })}
              </YStack>
            ) : (
              <Text fontFamily="$body" fontSize={14} color="$textSecondary">
                Keine Pflanzen mit Sensor vorhanden.
              </Text>
            )}
          </Card>

          {errorMessage ? <ErrorNotice message={errorMessage} /> : null}

          <Button
            onPress={promptTransferAction}
            disabled={!plantName.trim() || !selectedSourcePlantId || plantsWithSensors.length === 0}
            loading={isSubmitting}
          >
            Sensor übertragen
          </Button>
        </>
      ) : null}
    </Screen>
  )
}
