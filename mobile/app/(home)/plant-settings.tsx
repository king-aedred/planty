import { Colors } from '@/constants/colors'
import { api } from '../../../convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
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

  const [name, setName] = useState('')
  const [values, setValues] = useState<Record<ThresholdConfig['key'], string>>({
    moisture_threshold: '30',
    temperature_threshold_min: '15',
    temperature_threshold_max: '28',
    light_threshold_min: '200',
    light_threshold_max: '800',
  })
  const [isSaving, setIsSaving] = useState(false)

  const plant = useMemo(() => {
    const plantId = typeof params.plant_id === 'string' ? params.plant_id : ''

    return plants?.find((entry) => String(entry._id) === plantId) ?? null
  }, [params.plant_id, plants])

  useEffect(() => {
    if (!plant) {
      return
    }

    setName(plant.name)
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

  if (!plant) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Pressable accessibilityRole="button" onPress={goBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.backButtonText}>Zurück</Text>
          </Pressable>
          <Text style={styles.title}>Pflanzen-Einstellungen</Text>
          <Text style={styles.emptyText}>Pflanze nicht gefunden.</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.container}>
              <View style={styles.topRow}>
                <Pressable accessibilityRole="button" onPress={goBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
                  <Text style={styles.backButtonText}>Zurück</Text>
                </Pressable>
              </View>

              <View style={styles.hero}>
                <Text style={styles.eyebrow}>Planty</Text>
                <Text style={styles.title}>{plant.name} Einstellungen</Text>
              </View>

              <Section title="Pflanze">
                <Field label="Name ändern" value={name} onChangeText={setName} placeholder="Pflanzenname" autoCapitalize="words" />
              </Section>

              <Section title="Schwellenwerte">
                {thresholdConfigs.map((config) => (
                  <ThresholdControl
                    key={config.key}
                    config={config}
                    value={values[config.key]}
                    onChangeValue={(nextValue) =>
                      setValues((current) => ({
                        ...current,
                        [config.key]: nextValue,
                      }))
                    }
                  />
                ))}
              </Section>

              <Pressable
                accessibilityRole="button"
                onPress={() => void handleSave()}
                disabled={isSaving}
                style={({ pressed }) => [styles.saveButton, pressed && styles.pressed, isSaving && styles.saveButtonDisabled]}
              >
                <Text style={styles.saveButtonText}>{isSaving ? 'Speichere…' : 'Speichern'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function ThresholdControl({
  config,
  value,
  onChangeValue,
}: {
  config: ThresholdConfig
  value: string
  onChangeValue: (value: string) => void
}) {
  const numericValue = clampNumber(Number(value), config.min, config.max, config.defaultValue)

  const updateValue = (nextValue: number) => {
    const clampedValue = clampNumber(nextValue, config.min, config.max, config.defaultValue)
    onChangeValue(String(clampedValue))
  }

  return (
    <View style={styles.thresholdCard}>
      <View style={styles.thresholdHeader}>
        <Text style={styles.thresholdLabel}>{config.label}</Text>
        <Text style={styles.thresholdValue}>
          {numericValue} {config.unit}
        </Text>
      </View>

      <StepInput value={numericValue} min={config.min} max={config.max} onChangeValue={updateValue} />
    </View>
  )
}

function StepInput({
  value,
  min,
  max,
  onChangeValue,
}: {
  value: number
  min: number
  max: number
  onChangeValue: (value: number) => void
}) {
  return (
    <View style={styles.stepInputRow}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onChangeValue(value - 1)}
        style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
      >
        <Text style={styles.stepButtonText}>-</Text>
      </Pressable>

      <TextInput
        value={String(value)}
        onChangeText={(text) => {
          const parsedValue = Number(text)

          if (!Number.isFinite(parsedValue)) {
            return
          }

          onChangeValue(parsedValue)
        }}
        keyboardType="numeric"
        textAlign="center"
        style={styles.stepInput}
      />

      <Pressable
        accessibilityRole="button"
        onPress={() => onChangeValue(value + 1)}
        style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
      >
        <Text style={styles.stepButtonText}>+</Text>
      </Pressable>
    </View>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  )
}

function Field({ label, value, onChangeText, placeholder = '', autoCapitalize = 'none' }: { label: string; value: string; onChangeText: (text: string) => void; placeholder?: string; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters' }) {
  return (
    <View style={styles.fieldWrapper}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCapitalize={autoCapitalize}
        style={styles.input}
      />
    </View>
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
    padding: 20,
    gap: 20,
    backgroundColor: colors.background,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  backButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  hero: {
    gap: 8,
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
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionContent: {
    gap: 16,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
  },
  fieldWrapper: {
    gap: 8,
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  thresholdCard: {
    gap: 12,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  thresholdHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  thresholdLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  thresholdValue: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '800',
  },
  thresholdInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stepInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonText: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 22,
    marginTop: -1,
  },
  stepInput: {
    flex: 1,
    minWidth: 84,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: '800',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 15,
  },
  pressed: {
    opacity: 0.86,
  },
})