import { Colors } from '@/constants/colors'
import { api } from '../../../convex/_generated/api'
import BurgerMenu from '../../components/burger-menu'
import { useMutation } from 'convex/react'
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
  const [plantName, setPlantName] = useState('')
  const [deviceId, setDeviceId] = useState('fake-sensor-001')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleRegisterPlant = async () => {
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
                <Text style={styles.subtitle}>Registriere eine Pflanze und verbinde sie direkt mit einem Sensor.</Text>
              </View>

              <View style={styles.form}>
                <View style={styles.field}>
                  <Text style={styles.label}>Pflanzenname</Text>
                  <TextInput
                    value={plantName}
                    onChangeText={setPlantName}
                    placeholder="z. B. Monstera"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>

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
                  disabled={!plantName.trim() || !deviceId.trim() || isSubmitting}
                  style={({ pressed }) => [
                    styles.button,
                    (pressed || isSubmitting) && styles.buttonPressed,
                    (!plantName.trim() || !deviceId.trim()) && styles.buttonDisabled,
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