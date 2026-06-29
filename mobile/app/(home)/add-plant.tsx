import { Colors } from '@/constants/colors'
import { api } from '../../../convex/_generated/api'
import BurgerMenu from '../../components/burger-menu'
import { useMutation, useQuery } from 'convex/react'
import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  Alert,
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

type Step = 'choice' | 'with-sensor' | 'without-sensor' | 'transfer'

export default function AddPlantScreen() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user } = useUser()
  const router = useRouter()

  const clerkId = user?.id ?? ''
  const plants = useQuery(api.plants.getAllPlantsByClerkId, clerkId ? { clerk_id: clerkId } : 'skip')
  const registerSensor = useMutation(api.sensors.registerSensor)
  const createPlant = useMutation(api.plants.createPlant)
  const transferSensor = useMutation(api.plants.transferSensor)
  const deletePlant = useMutation(api.plants.deletePlant)

  const [step, setStep] = useState<Step>('choice')
  const [plantName, setPlantName] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [selectedSourcePlantId, setSelectedSourcePlantId] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const plantsWithSensors = useMemo(
    () => (plants ?? []).filter((plant) => Boolean(plant.device_id ?? plant.sensor_id)),
    [plants],
  )

  const resetForm = () => {
    setPlantName('')
    setDeviceId('')
    setSelectedSourcePlantId('')
    setErrorMessage('')
    setStep('choice')
  }

  const goToPlantList = () => {
    router.replace('/(home)/plant-list')
  }

  const ensurePlantCreated = async (deviceIdValue?: string) => {
    return await createPlant({
      clerk_id: clerkId,
      ...(deviceIdValue ? { device_id: deviceIdValue } : {}),
      name: plantName.trim(),
    })
  }

  const handleRegisterWithSensor = async () => {
    const trimmedPlantName = plantName.trim()
    const trimmedDeviceId = deviceId.trim()

    if (!clerkId || !trimmedPlantName || !trimmedDeviceId || isSubmitting) {
      return
    }

    setErrorMessage('')
    setIsSubmitting(true)

    try {
      await registerSensor({ device_id: trimmedDeviceId })
      await createPlant({ clerk_id: clerkId, device_id: trimmedDeviceId, name: trimmedPlantName })
      resetForm()
      goToPlantList()
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
    const trimmedPlantName = plantName.trim()

    if (!clerkId || !trimmedPlantName || isSubmitting) {
      return
    }

    setErrorMessage('')
    setIsSubmitting(true)

    try {
      await createPlant({ clerk_id: clerkId, name: trimmedPlantName })
      resetForm()
      goToPlantList()
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.container}>
              <BurgerMenu />

              <View style={styles.hero}>
                <Text style={styles.eyebrow}>Planty</Text>
                <Text style={styles.title}>Neue Pflanze hinzufügen</Text>
                {step === 'choice' ? (
                  <Text style={styles.subtitle}>Hast du einen Sensor für diese Pflanze?</Text>
                ) : null}
              </View>

              {step === 'choice' ? (
                <View style={styles.choiceGrid}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setStep('with-sensor')}
                    style={({ pressed }) => [styles.choiceButton, pressed && styles.choiceButtonPressed]}
                  >
                    <Text style={styles.choiceButtonTitle}>Ja, ich habe einen Sensor</Text>
                    <Text style={styles.choiceButtonText}>Sensor registrieren und Pflanze direkt verbinden.</Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setStep('without-sensor')}
                    style={({ pressed }) => [styles.choiceButton, pressed && styles.choiceButtonPressed]}
                  >
                    <Text style={styles.choiceButtonTitle}>Nein, ohne Sensor</Text>
                    <Text style={styles.choiceButtonText}>Pflanze anlegen und später Sensor zuweisen.</Text>
                  </Pressable>
                </View>
              ) : null}

              {step === 'with-sensor' ? (
                <View style={styles.form}>
                  <Text style={styles.sectionTitle}>Mit Sensor</Text>

                  <Field label="Sensor ID" value={deviceId} onChangeText={setDeviceId} placeholder="fake-sensor-001" autoCapitalize="none" />
                  <Field label="Pflanzenname" value={plantName} onChangeText={setPlantName} placeholder="z. B. Monstera" autoCapitalize="words" />

                  {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

                  <Pressable
                    accessibilityRole="button"
                    disabled={!plantName.trim() || !deviceId.trim() || isSubmitting}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      (pressed || isSubmitting) && styles.primaryButtonPressed,
                      (!plantName.trim() || !deviceId.trim()) && styles.primaryButtonDisabled,
                    ]}
                    onPress={() => void handleRegisterWithSensor()}
                  >
                    <Text style={styles.primaryButtonText}>{isSubmitting ? 'Registriere…' : 'Pflanze registrieren'}</Text>
                  </Pressable>

                  <Pressable accessibilityRole="button" onPress={() => setStep('choice')} style={styles.backLink}>
                    <Text style={styles.backLinkText}>Zurück</Text>
                  </Pressable>
                </View>
              ) : null}

              {step === 'without-sensor' ? (
                <View style={styles.form}>
                  <Text style={styles.sectionTitle}>Ohne Sensor</Text>
                  <Text style={styles.noticeText}>
                    Ohne Sensor kannst du keine Messdaten erheben. Du kannst später einen Sensor zuweisen.
                  </Text>

                  <Field label="Pflanzenname" value={plantName} onChangeText={setPlantName} placeholder="z. B. Monstera" autoCapitalize="words" />

                  {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

                  <Pressable
                    accessibilityRole="button"
                    disabled={!plantName.trim() || isSubmitting}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      (pressed || isSubmitting) && styles.primaryButtonPressed,
                      !plantName.trim() && styles.primaryButtonDisabled,
                    ]}
                    onPress={() => void handleCreateWithoutSensor()}
                  >
                    <Text style={styles.primaryButtonText}>{isSubmitting ? 'Lege an…' : 'Pflanze trotzdem anlegen'}</Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setStep('transfer')}
                    style={styles.linkButton}
                  >
                    <Text style={styles.linkButtonText}>Sensor von einer anderen Pflanze übertragen</Text>
                  </Pressable>

                  <Pressable accessibilityRole="button" onPress={() => setStep('choice')} style={styles.backLink}>
                    <Text style={styles.backLinkText}>Zurück</Text>
                  </Pressable>
                </View>
              ) : null}

              {step === 'transfer' ? (
                <View style={styles.form}>
                  <Text style={styles.sectionTitle}>Sensor ummelden</Text>
                  <Text style={styles.noticeText}>Wähle eine Pflanze, von der der Sensor übernommen werden soll.</Text>

                  <Field label="Pflanzenname für die neue Pflanze" value={plantName} onChangeText={setPlantName} placeholder="z. B. Monstera" autoCapitalize="words" />

                  <Text style={styles.selectorLabel}>Quellpflanze</Text>
                  <View style={styles.selectorList}>
                    {plantsWithSensors.length > 0 ? (
                      plantsWithSensors.map((plant) => {
                        const plantId = String(plant._id)
                        const selected = selectedSourcePlantId === plantId
                        const plantDeviceId = plant.device_id ?? plant.sensor_id ?? ''

                        return (
                          <Pressable
                            key={plantId}
                            accessibilityRole="button"
                            onPress={() => setSelectedSourcePlantId(plantId)}
                            style={({ pressed }) => [
                              styles.sensorCard,
                              selected && styles.sensorCardSelected,
                              pressed && styles.sensorCardPressed,
                            ]}
                          >
                            <View style={styles.sensorCardHeader}>
                              <Text style={styles.sensorCardTitle}>{plant.name}</Text>
                              <View style={selected ? styles.radioSelected : styles.radio} />
                            </View>
                            <Text style={styles.sensorCardText}>{plantDeviceId}</Text>
                          </Pressable>
                        )
                      })
                    ) : (
                      <View style={styles.emptyHint}>
                        <Text style={styles.emptyHintText}>Keine Pflanzen mit Sensor vorhanden.</Text>
                      </View>
                    )}
                  </View>

                  {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

                  <Pressable
                    accessibilityRole="button"
                    disabled={!plantName.trim() || !selectedSourcePlantId || isSubmitting || plantsWithSensors.length === 0}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      (pressed || isSubmitting) && styles.primaryButtonPressed,
                      (!plantName.trim() || !selectedSourcePlantId || plantsWithSensors.length === 0) && styles.primaryButtonDisabled,
                    ]}
                    onPress={promptTransferAction}
                  >
                    <Text style={styles.primaryButtonText}>{isSubmitting ? 'Übertrage…' : 'Sensor übertragen'}</Text>
                  </Pressable>

                  <Pressable accessibilityRole="button" onPress={() => setStep('without-sensor')} style={styles.backLink}>
                    <Text style={styles.backLinkText}>Zurück</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  autoCapitalize,
}: {
  label: string
  value: string
  onChangeText: (value: string) => void
  placeholder: string
  autoCapitalize: 'none' | 'sentences' | 'words' | 'characters'
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={styles.input}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCapitalize !== 'none'}
      />
    </View>
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
    gap: 20,
  },
  hero: {
    gap: 10,
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
  },
  choiceGrid: {
    gap: 12,
  },
  choiceButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    gap: 8,
  },
  choiceButtonPressed: {
    opacity: 0.9,
  },
  choiceButtonTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  choiceButtonText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  form: {
    gap: 14,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  noticeText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
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
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryButtonPressed: {
    opacity: 0.88,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: '700',
  },
  backLink: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  backLinkText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 16,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  linkButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  selectorLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  selectorList: {
    gap: 10,
  },
  sensorCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 6,
  },
  sensorCardSelected: {
    borderColor: colors.accent,
  },
  sensorCardPressed: {
    opacity: 0.92,
  },
  sensorCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sensorCardTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  sensorCardText: {
    color: colors.muted,
    fontSize: 13,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
  },
  radioSelected: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 5,
    borderColor: colors.accent,
  },
  emptyHint: {
    padding: 16,
    borderRadius: 16,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  emptyHintText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
})