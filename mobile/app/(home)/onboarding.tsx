import { api } from '../../../convex/_generated/api'
import BurgerMenu from '../../components/burger-menu'
import { BleProvisioning } from '../../components/onboarding/ble-provisioning'
import { useMutation, useQuery } from 'convex/react'
import { useRouter } from 'expo-router'
import { Alert } from 'react-native'
import { useState } from 'react'
import { SpeciesPicker } from '../../components/plants/species-picker'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { ErrorNotice } from '../../components/ui/error-notice'
import { Screen } from '../../components/ui/screen'
import { ScreenHeader } from '../../components/ui/screen-header'
import { TextField } from '../../components/ui/text-field'

export default function OnboardingScreen() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user } = useUser()
  const router = useRouter()
  const createPlant = useMutation(api.plants.createPlant)

  const clerkId = user?.id ?? ''
  const [speciesSearch, setSpeciesSearch] = useState('')
  const [selectedSpecies, setSelectedSpecies] = useState<{
    id: string
    common_name: string
    name: string
  } | null>(null)
  const [manualPlantName, setManualPlantName] = useState('')
  const [isManualMode, setIsManualMode] = useState(false)
  const [deviceId, setDeviceId] = useState('')
  const [sensorRegistered, setSensorRegistered] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const speciesResults = useQuery(api.plant_species.searchPlantSpecies, { search: speciesSearch }) ?? []

  const handleSpeciesSearchChange = (value: string) => {
    setSpeciesSearch(value)
    setSelectedSpecies(null)
    setIsManualMode(false)
    setManualPlantName('')
  }

  const handleSelectSpecies = (species: { id: string; common_name: string; name: string }) => {
    setSelectedSpecies(species)
    setManualPlantName(species.common_name)
    setErrorMessage('')
    setIsManualMode(false)
  }

  const handleManualEntry = () => {
    setSelectedSpecies(null)
    setIsManualMode(true)
    setManualPlantName('')
    setErrorMessage('')
  }

  // Der Sensor hat sich bereits selbst per POST /device/claim diesem Konto zugeordnet.
  const handleSensorProvisioned = async (provisionedDeviceId: string) => {
    setDeviceId(provisionedDeviceId)
    setSensorRegistered(true)
  }

  const handleRegisterPlant = async () => {
    const trimmedPlantName = selectedSpecies ? selectedSpecies.common_name.trim() : manualPlantName.trim()
    const trimmedDeviceId = deviceId.trim()

    if (!clerkId || !trimmedPlantName || !sensorRegistered || !trimmedDeviceId || isSubmitting) {
      return
    }

    setErrorMessage('')
    setIsSubmitting(true)

    try {
      await createPlant({
        clerk_id: clerkId,
        device_id: trimmedDeviceId,
        species_id: selectedSpecies?.id,
        name: trimmedPlantName,
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
              router.replace({ pathname: '/(home)/status', params: { device_id: trimmedDeviceId, name: trimmedPlantName } })
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

  const canSubmit = Boolean(selectedSpecies || (isManualMode && manualPlantName.trim())) && sensorRegistered

  return (
    <Screen scroll>
      <BurgerMenu onboardingMode={true} />
      <ScreenHeader
        eyebrow="Callgreen"
        title="Deine erste Pflanze"
        subtitle="Verbinde deinen Sensor und such dann deine Pflanze aus der Datenbank oder gib sie selbst ein."
      />

      <BleProvisioning onProvisioned={handleSensorProvisioned} />

      <Card>
        <SpeciesPicker
          search={speciesSearch}
          onSearchChange={handleSpeciesSearchChange}
          results={speciesResults}
          selected={selectedSpecies}
          onSelect={handleSelectSpecies}
          onManualEntry={handleManualEntry}
        />

        {isManualMode ? (
          <TextField label="Pflanzenname" value={manualPlantName} onChangeText={setManualPlantName} placeholder="z. B. Monstera" autoCapitalize="words" />
        ) : null}

        {errorMessage ? <ErrorNotice message={errorMessage} /> : null}

        <Button onPress={() => void handleRegisterPlant()} disabled={!canSubmit} loading={isSubmitting}>
          Pflanze anlegen
        </Button>
      </Card>
    </Screen>
  )
}
