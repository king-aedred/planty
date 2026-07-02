import { Colors } from '@/constants/colors'
import { api } from '../../../convex/_generated/api'
import BurgerMenu from '../../components/burger-menu'
import { useMutation, useQuery } from 'convex/react'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const colors = Colors.dark

export default function OnboardingScreen() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user } = useUser()
  const router = useRouter()
  const registerSensor = useMutation(api.sensors.registerSensor)
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
  const [deviceId, setDeviceId] = useState('fake-sensor-001')
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

  const handleRegisterPlant = async () => {
    const trimmedPlantName = selectedSpecies ? selectedSpecies.common_name.trim() : manualPlantName.trim()
    const trimmedDeviceId = deviceId.trim()

    if (!clerkId || !trimmedPlantName || !trimmedDeviceId || isSubmitting) {
      return
    }

    setErrorMessage('')
    setIsSubmitting(true)

    try {
      await registerSensor({ device_id: trimmedDeviceId })
      await createPlant({
        clerk_id: clerkId,
        device_id: trimmedDeviceId,
        species_id: selectedSpecies?.id,
        name: trimmedPlantName,
      })
      router.replace({ pathname: '/(home)/status', params: { device_id: trimmedDeviceId, name: trimmedPlantName } })
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

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.container}>
              <BurgerMenu onboardingMode={true} />
              <View style={styles.hero}>
                <Text style={styles.eyebrow}>Planty</Text>
                <Text style={styles.title}>Deine erste Pflanze 🌱</Text>
                <Text style={styles.subtitle}>Suche eine Pflanze in der Datenbank oder gib sie manuell ein.</Text>
              </View>

              <View style={styles.form}>
                <View style={styles.field}>
                  <Text style={styles.label}>Pflanze suchen...</Text>
                  <TextInput
                    value={speciesSearch}
                    onChangeText={handleSpeciesSearchChange}
                    placeholder="Pflanze suchen..."
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                </View>

                {selectedSpecies ? (
                  <View style={styles.selectedSpeciesCard}>
                    <View style={styles.selectedSpeciesTextBlock}>
                      <Text style={styles.selectedSpeciesTitle}>{selectedSpecies.common_name}</Text>
                      <Text style={styles.selectedSpeciesSubtitle}>{selectedSpecies.name}</Text>
                    </View>
                    <Text style={styles.selectedSpeciesCheck}>✓</Text>
                  </View>
                ) : (
                  <View style={styles.speciesResults}>
                    {speciesResults.map((species) => (
                      <Pressable
                        key={species.id}
                        accessibilityRole="button"
                        onPress={() => handleSelectSpecies(species)}
                        style={({ pressed }) => [styles.speciesItem, pressed && styles.speciesItemPressed]}
                      >
                        <View style={styles.speciesItemTextBlock}>
                          <Text style={styles.speciesItemTitle}>{species.common_name}</Text>
                          <Text style={styles.speciesItemSubtitle}>{species.name}</Text>
                        </View>
                      </Pressable>
                    ))}

                    {speciesSearch.trim() && speciesResults.length === 0 ? (
                      <Pressable accessibilityRole="button" onPress={handleManualEntry} style={styles.manualCta}>
                        <Text style={styles.manualCtaText}>Nicht dabei? Namen manuell eingeben</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}

                {isManualMode ? (
                  <View style={styles.field}>
                    <Text style={styles.label}>Pflanzenname</Text>
                    <TextInput
                      value={manualPlantName}
                      onChangeText={setManualPlantName}
                      placeholder="z. B. Monstera"
                      placeholderTextColor={colors.muted}
                      style={styles.input}
                      autoCapitalize="words"
                      returnKeyType="next"
                    />
                  </View>
                ) : null}

                <View style={styles.field}>
                  <Text style={styles.label}>Sensor ID</Text>
                  <TextInput
                    value={deviceId}
                    onChangeText={setDeviceId}
                    placeholder="fake-sensor-001"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

                <Pressable
                  accessibilityRole="button"
                  disabled={!(selectedSpecies || (isManualMode && manualPlantName.trim())) || !deviceId.trim() || isSubmitting}
                  style={({ pressed }) => [
                    styles.button,
                    (pressed || isSubmitting) && styles.buttonPressed,
                    (!(selectedSpecies || (isManualMode && manualPlantName.trim())) || !deviceId.trim()) && styles.buttonDisabled,
                  ]}
                  onPress={handleRegisterPlant}
                >
                  <Text style={styles.buttonText}>{isSubmitting ? 'Registriere…' : 'Pflanze registrieren'}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
  },
  eyebrow: {
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 22,
    maxWidth: 340,
  },
  form: {
    gap: 14,
    paddingBottom: 8,
  },
  field: {
    gap: 8,
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  speciesResults: {
    gap: 10,
  },
  speciesItem: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  speciesItemPressed: {
    opacity: 0.88,
  },
  speciesItemTextBlock: {
    gap: 2,
  },
  speciesItemTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  speciesItemSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  selectedSpeciesCard: {
    backgroundColor: colors.surface,
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  selectedSpeciesTextBlock: {
    flex: 1,
    gap: 2,
  },
  selectedSpeciesTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  selectedSpeciesSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  selectedSpeciesCheck: {
    color: colors.success,
    fontSize: 18,
    fontWeight: '900',
  },
  manualCta: {
    paddingVertical: 2,
  },
  manualCtaText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '700',
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: '700',
  },
})