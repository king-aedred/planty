import { Colors } from '@/constants/colors'
import { useMemo, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

const colors = Colors.dark

export type SensorPlant = {
  id: string
  name: string
  deviceId: string
}

type TimeTravelResponse = {
  status: string
  date: string
  states?: {
    moisture_state: string
    temperature_state: string
    light_state: string
  }
  message?: string
}

type TimeTravelScenario = 'falling' | 'rising' | 'critical' | 'ok' | 'random'

type MetricPreview = {
  label: string
  value: number
  state: 'ok' | 'warning' | 'critical'
  stateLabel: string
}

const pad2 = (value: number): string => String(value).padStart(2, '0')

const todayString = (): string => new Date().toISOString().slice(0, 10)

const currentHourString = (): string => pad2(new Date().getHours())

const shiftDate = (offsetDays: number): string => {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value))

const parseNumericInput = (value: string, fallback: number, minimum: number, maximum: number): number => {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return clamp(parsed, minimum, maximum)
}

const getMoistureState = (value: number): 'critical' | 'warning' | 'ok' => {
  if (value < 20) {
    return 'critical'
  }

  if (value < 35) {
    return 'warning'
  }

  return 'ok'
}

const getTemperatureState = (value: number): 'critical' | 'warning' | 'ok' => {
  if (value < 15) {
    return 'warning'
  }

  if (value > 30) {
    return 'warning'
  }

  return 'ok'
}

const getLightState = (value: number): 'critical' | 'warning' | 'ok' => {
  if (value < 150) {
    return 'warning'
  }

  if (value <= 800) {
    return 'ok'
  }

  return 'warning'
}

const getOverallState = (metrics: MetricPreview[]): 'ok' | 'warning' | 'critical' => {
  if (metrics.some((metric) => metric.state === 'critical')) {
    return 'critical'
  }

  if (metrics.some((metric) => metric.state === 'warning')) {
    return 'warning'
  }

  return 'ok'
}

const stateLabelStyles: Record<MetricPreview['state'], object> = {
  ok: { color: colors.success, backgroundColor: 'rgba(127, 211, 138, 0.12)', borderColor: 'rgba(127, 211, 138, 0.28)' },
  warning: { color: colors.warning, backgroundColor: 'rgba(240, 164, 75, 0.12)', borderColor: 'rgba(240, 164, 75, 0.28)' },
  critical: { color: colors.critical, backgroundColor: 'rgba(255, 140, 140, 0.12)', borderColor: 'rgba(255, 140, 140, 0.28)' },
}

export default function TimeTravelTab({
  plants,
  serverBaseUrl,
  getAuthorizationHeaders,
  overrideContactWindow,
  onToggleOverrideContactWindow,
}: {
  plants: SensorPlant[]
  serverBaseUrl: string | null
  getAuthorizationHeaders: () => Promise<Record<string, string>>
  overrideContactWindow: boolean
  onToggleOverrideContactWindow: () => void
}) {
  const [selectedPlantId, setSelectedPlantId] = useState('')
  const [isPlantDropdownOpen, setIsPlantDropdownOpen] = useState(false)
  const [date, setDate] = useState(todayString())
  const [hour, setHour] = useState(currentHourString())
  const [moisture, setMoisture] = useState('50')
  const [temperature, setTemperature] = useState('21')
  const [lightLevel, setLightLevel] = useState('500')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isBatchOpen, setIsBatchOpen] = useState(false)
  const [batchFromDate, setBatchFromDate] = useState(todayString())
  const [batchToDate, setBatchToDate] = useState(todayString())
  const [batchScenario, setBatchScenario] = useState<TimeTravelScenario>('ok')
  const [batchProgress, setBatchProgress] = useState('')
  const [resultMessage, setResultMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (plants.length === 0) {
      setSelectedPlantId('')
      return
    }

    setSelectedPlantId((current) => {
      if (current && plants.some((plant) => plant.id === current)) {
        return current
      }

      return plants[0].id
    })
  }, [plants])

  const selectedPlant = useMemo(
    () => plants.find((plant) => plant.id === selectedPlantId) ?? plants[0] ?? null,
    [plants, selectedPlantId],
  )

  const metricPreview = useMemo<MetricPreview[]>(() => {
    const moistureValue = parseNumericInput(moisture, 50, 0, 100)
    const temperatureValue = parseNumericInput(temperature, 21, 0, 40)
    const lightValue = parseNumericInput(lightLevel, 500, 0, 2000)

    return [
      {
        label: 'Feuchtigkeit',
        value: moistureValue,
        state: getMoistureState(moistureValue),
        stateLabel: getMoistureState(moistureValue),
      },
      {
        label: 'Temperatur',
        value: temperatureValue,
        state: getTemperatureState(temperatureValue),
        stateLabel: getTemperatureState(temperatureValue),
      },
      {
        label: 'Licht',
        value: lightValue,
        state: getLightState(lightValue),
        stateLabel: getLightState(lightValue),
      },
    ]
  }, [lightLevel, moisture, temperature])

  const overallState = getOverallState(metricPreview)

  const setShortcutDate = (offsetDays: number) => {
    setDate(shiftDate(offsetDays))
  }

  const buildRequestPayload = (overrides?: Partial<{ date: string; hour: string; moisture: number; temperature: number; lightLevel: number }>) => {
    const targetDate = overrides?.date ?? date
    const targetHour = overrides?.hour ?? hour
    const targetMoisture = overrides?.moisture ?? parseNumericInput(moisture, 50, 0, 100)
    const targetTemperature = overrides?.temperature ?? parseNumericInput(temperature, 21, 0, 40)
    const targetLightLevel = overrides?.lightLevel ?? parseNumericInput(lightLevel, 500, 0, 2000)

    return {
      device_id: selectedPlant?.deviceId ?? '',
      date: targetDate,
      hour: Number(targetHour),
      moisture_median: targetMoisture,
      temperature_median: targetTemperature,
      light_level_median: targetLightLevel,
      override_contact_window: overrideContactWindow,
    }
  }

  const formatStateText = (state?: string): string => {
    if (!state) {
      return 'n/a'
    }

    return state
  }

  const submitSingleEntry = async () => {
    if (!serverBaseUrl || !selectedPlant) {
      setErrorMessage('Bitte zuerst eine Pflanze mit Sensor auswählen')
      return
    }

    const hourValue = Number(hour)

    if (!Number.isInteger(hourValue) || hourValue < 0 || hourValue > 23) {
      setErrorMessage('Bitte eine Stunde zwischen 0 und 23 eingeben')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')
    setResultMessage('')
    setBatchProgress('')

    try {
      const response = await fetch(`${serverBaseUrl}/dev/time-travel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await getAuthorizationHeaders()),
        },
        body: JSON.stringify(buildRequestPayload()),
      })

      const responseBody = (await response.json()) as TimeTravelResponse

      if (!response.ok) {
        throw new Error(responseBody?.message ?? responseBody?.status ?? 'Zeitreise fehlgeschlagen')
      }

      setResultMessage(
        `${responseBody.date} · ${formatStateText(responseBody.states?.moisture_state)} / ${formatStateText(responseBody.states?.temperature_state)} / ${formatStateText(responseBody.states?.light_state)} · Benachrichtigung ausgelöst`,
      )
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Zeitreise fehlgeschlagen')
    } finally {
      setIsSubmitting(false)
    }
  }

  const generateScenarioValues = (scenario: TimeTravelScenario, index: number) => {
    if (scenario === 'critical') {
      return { moisture: 10, temperature: 10, lightLevel: 100 }
    }

    if (scenario === 'ok') {
      return { moisture: 55, temperature: 21, lightLevel: 500 }
    }

    if (scenario === 'falling') {
      return {
        moisture: clamp(55 - index * 10, 0, 100),
        temperature: 21,
        lightLevel: 500,
      }
    }

    if (scenario === 'rising') {
      return {
        moisture: clamp(20 + index * 10, 0, 100),
        temperature: 21,
        lightLevel: 500,
      }
    }

    return {
      moisture: Math.round(clamp(15 + Math.random() * 70, 0, 100)),
      temperature: Math.round(clamp(13 + Math.random() * 12, 0, 40)),
      lightLevel: Math.round(clamp(150 + Math.random() * 1200, 0, 2000)),
    }
  }

  const parseDateToUtc = (value: string): number => {
    const [year, month, day] = value.split('-').map((part) => Number(part))
    return Date.UTC(year, month - 1, day)
  }

  const formatUtcDate = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 10)

  const getBatchDates = (): string[] => {
    const start = parseDateToUtc(batchFromDate)
    const end = parseDateToUtc(batchToDate)

    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return []
    }

    const dates: string[] = []
    const current = new Date(start)

    while (current.getTime() <= end) {
      dates.push(current.toISOString().slice(0, 10))
      current.setUTCDate(current.getUTCDate() + 1)
    }

    return dates
  }

  const submitBatchEntries = async () => {
    if (!serverBaseUrl || !selectedPlant) {
      setErrorMessage('Bitte zuerst eine Pflanze mit Sensor auswählen')
      return
    }

    const dates = getBatchDates()

    if (dates.length === 0) {
      setErrorMessage('Bitte einen gültigen Datumsbereich wählen')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')
    setResultMessage('')
    setBatchProgress(`0/${dates.length}`)

    try {
      for (let index = 0; index < dates.length; index += 1) {
        const values = generateScenarioValues(batchScenario, index)
        setBatchProgress(`Tag ${index + 1}/${dates.length}`)

        const response = await fetch(`${serverBaseUrl}/dev/time-travel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(await getAuthorizationHeaders()),
          },
          body: JSON.stringify({
            ...buildRequestPayload({
              date: dates[index],
              moisture: values.moisture,
              temperature: values.temperature,
              lightLevel: values.lightLevel,
            }),
          }),
        })

        const responseBody = (await response.json()) as TimeTravelResponse

        if (!response.ok) {
          throw new Error(responseBody?.message ?? `Fehler an Tag ${index + 1}`)
        }
      }

      setResultMessage(`${dates.length} Einträge erstellt · Benachrichtigungen ausgelöst`)
      setBatchProgress(`${dates.length}/${dates.length}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Mehrtages-Zeitreise fehlgeschlagen')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Zeitreise</Text>
      <Text style={styles.helperText}>Erstelle rückdatierte Tageszusammenfassungen direkt im Backend. Die States werden live aus deinen Eingaben berechnet.</Text>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: overrideContactWindow }}
        onPress={onToggleOverrideContactWindow}
        style={({ pressed }) => [styles.checkboxRow, pressed && styles.checkboxRowPressed]}
      >
        <View style={[styles.inlineCheckbox, overrideContactWindow && styles.inlineCheckboxSelected]}>
          {overrideContactWindow ? <View style={styles.inlineCheckboxMark} /> : null}
        </View>
        <Text style={styles.checkboxRowText}>☑ Kontaktzeitfenster ignorieren</Text>
      </Pressable>

      <View style={styles.dropdownBlock}>
        <Text style={styles.selectorLabel}>Pflanze / Sensor auswählen</Text>
        {selectedPlant ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setIsPlantDropdownOpen((current) => !current)}
            style={({ pressed }) => [styles.dropdownButton, pressed && styles.selectorCardPressed]}
          >
            <View style={styles.selectorCardCopy}>
              <Text style={styles.selectorCardTitle}>{selectedPlant.name}</Text>
              <Text style={styles.selectorCardText}>{selectedPlant.deviceId}</Text>
            </View>
            <Text style={styles.dropdownChevron}>{isPlantDropdownOpen ? '▴' : '▾'}</Text>
          </Pressable>
        ) : (
          <Text style={styles.helperText}>Keine Pflanzen mit Sensor gefunden.</Text>
        )}

        <Modal visible={isPlantDropdownOpen} transparent animationType="fade" onRequestClose={() => setIsPlantDropdownOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsPlantDropdownOpen(false)}>
            <Pressable style={styles.dropdownPanel} onPress={() => undefined}>
              <Text style={styles.dropdownTitle}>Pflanze auswählen</Text>
              <View style={styles.selectorList}>
                {plants.map((plant) => {
                  const isSelected = selectedPlantId === plant.id

                  return (
                    <Pressable
                      key={plant.id}
                      accessibilityRole="button"
                      onPress={() => {
                        setSelectedPlantId(plant.id)
                        setIsPlantDropdownOpen(false)
                      }}
                      style={({ pressed }) => [
                        styles.selectorCard,
                        isSelected && styles.selectorCardSelected,
                        pressed && styles.selectorCardPressed,
                      ]}
                    >
                      <View style={styles.selectorCardHeader}>
                        <View style={styles.selectorCardCopy}>
                          <Text style={styles.selectorCardTitle}>{plant.name}</Text>
                          <Text style={styles.selectorCardText}>{plant.deviceId}</Text>
                        </View>
                        <View style={isSelected ? styles.radioSelected : styles.radio} />
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>

      <View style={styles.inputGrid}>
        <View style={styles.inputCard}>
          <Text style={styles.selectorLabel}>Datum</Text>
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            style={styles.textInput}
          />
          <View style={styles.shortcutRow}>
            <ShortcutButton label="Heute" onPress={() => setDate(todayString())} />
            <ShortcutButton label="Gestern" onPress={() => setDate(shiftDate(-1))} />
            <ShortcutButton label="-2 Tage" onPress={() => setDate(shiftDate(-2))} />
            <ShortcutButton label="-3 Tage" onPress={() => setDate(shiftDate(-3))} />
            <ShortcutButton label="-7 Tage" onPress={() => setDate(shiftDate(-7))} />
          </View>
        </View>

        <View style={styles.inputCard}>
          <Text style={styles.selectorLabel}>Uhrzeit</Text>
          <TextInput
            value={hour}
            onChangeText={(value) => setHour(value.replace(/[^0-9]/g, '').slice(0, 2))}
            placeholder="HH"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            style={styles.textInput}
          />
        </View>

        <View style={styles.inputCard}>
          <Text style={styles.selectorLabel}>Messwerte</Text>
          <StepInput label="Feuchtigkeit" value={moisture} onChangeValue={setMoisture} minimum={0} maximum={100} />
          <StepInput label="Temperatur" value={temperature} onChangeValue={setTemperature} minimum={0} maximum={40} />
          <StepInput label="Licht" value={lightLevel} onChangeValue={setLightLevel} minimum={0} maximum={2000} />
        </View>
      </View>

      <View style={styles.previewPanel}>
        <Text style={styles.sectionSubtitle}>State-Preview</Text>
        <Text style={styles.helperText}>Gesamtzustand: {overallState}</Text>
        <View style={styles.previewGrid}>
          {metricPreview.map((metric) => (
            <View key={metric.label} style={styles.previewCard}>
              <Text style={styles.previewLabel}>{metric.label}</Text>
              <Text style={styles.previewValue}>{metric.value}</Text>
              <View style={[styles.stateBadge, stateLabelStyles[metric.state]]}>
                <Text style={[styles.stateBadgeText, stateLabelStyles[metric.state]]}>{metric.stateLabel}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => void submitSingleEntry()}
        disabled={isSubmitting || !selectedPlant}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed, isSubmitting && styles.buttonDisabled]}
      >
        <Text style={styles.primaryButtonText}>{isSubmitting ? 'Erstelle…' : 'Eintrag erstellen'}</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => setIsBatchOpen((current) => !current)}
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
      >
        <Text style={styles.secondaryButtonText}>Mehrere Tage auf einmal</Text>
      </Pressable>

      {isBatchOpen ? (
        <View style={styles.batchPanel}>
          <Text style={styles.sectionSubtitle}>Mehrtages-Zeitreise</Text>
          <View style={styles.inputGrid}>
            <View style={styles.inputCard}>
              <Text style={styles.selectorLabel}>Von Datum</Text>
              <TextInput value={batchFromDate} onChangeText={setBatchFromDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} autoCapitalize="none" style={styles.textInput} />
            </View>
            <View style={styles.inputCard}>
              <Text style={styles.selectorLabel}>Bis Datum</Text>
              <TextInput value={batchToDate} onChangeText={setBatchToDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} autoCapitalize="none" style={styles.textInput} />
            </View>
          </View>

          <Text style={styles.selectorLabel}>Szenario wählen</Text>
          <View style={styles.selectorList}>
            {scenarioOptions.map((option) => {
              const selected = batchScenario === option.value

              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  onPress={() => setBatchScenario(option.value)}
                  style={({ pressed }) => [
                    styles.selectorCard,
                    selected && styles.selectorCardSelected,
                    pressed && styles.selectorCardPressed,
                  ]}
                >
                  <View style={styles.selectorCardHeader}>
                    <View style={styles.selectorCardCopy}>
                      <Text style={styles.selectorCardTitle}>{option.label}</Text>
                      <Text style={styles.selectorCardText}>{option.description}</Text>
                    </View>
                    <View style={selected ? styles.radioSelected : styles.radio} />
                  </View>
                </Pressable>
              )
            })}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => void submitBatchEntries()}
            disabled={isSubmitting || !selectedPlant}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed, isSubmitting && styles.buttonDisabled]}
          >
            <Text style={styles.primaryButtonText}>{isSubmitting ? 'Erstelle Batch…' : 'Alle Einträge erstellen'}</Text>
          </Pressable>

          {batchProgress ? <Text style={styles.helperText}>{batchProgress}</Text> : null}
        </View>
      ) : null}

      {resultMessage ? <Text style={styles.success}>{resultMessage}</Text> : null}
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      {isSubmitting ? <ActivityIndicator color={colors.accent} /> : null}
    </View>
  )
}

function ShortcutButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.shortcutButton, pressed && styles.buttonPressed]}>
      <Text style={styles.shortcutButtonText}>{label}</Text>
    </Pressable>
  )
}

function StepInput({
  label,
  value,
  onChangeValue,
  minimum,
  maximum,
}: {
  label: string
  value: string
  onChangeValue: (value: string) => void
  minimum: number
  maximum: number
}) {
  const numericValue = Number(value)
  const decrementDisabled = !Number.isFinite(numericValue) || numericValue <= minimum
  const incrementDisabled = !Number.isFinite(numericValue) || numericValue >= maximum

  return (
    <View style={styles.stepInputRow}>
      <View style={styles.stepInputLabelColumn}>
        <Text style={styles.stepInputLabel}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={(nextValue) => onChangeValue(nextValue.replace(/[^0-9]/g, '').slice(0, 4))}
          placeholder={`0-${maximum}`}
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          style={styles.textInput}
        />
      </View>
      <View style={styles.stepButtonColumn}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onChangeValue(String(clamp((Number.isFinite(numericValue) ? numericValue : minimum) + 1, minimum, maximum)))}
          style={({ pressed }) => [styles.stepButton, pressed && styles.buttonPressed, incrementDisabled && styles.buttonDisabled]}
        >
          <Text style={styles.stepButtonText}>+</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => onChangeValue(String(clamp((Number.isFinite(numericValue) ? numericValue : minimum) - 1, minimum, maximum)))}
          style={({ pressed }) => [styles.stepButton, pressed && styles.buttonPressed, decrementDisabled && styles.buttonDisabled]}
        >
          <Text style={styles.stepButtonText}>-</Text>
        </Pressable>
      </View>
    </View>
  )
}

const scenarioOptions: Array<{ value: TimeTravelScenario; label: string; description: string }> = [
  { value: 'falling', label: 'Fallend', description: 'Feuchtigkeit sinkt täglich um 10%' },
  { value: 'rising', label: 'Steigend', description: 'Feuchtigkeit steigt täglich um 10%' },
  { value: 'critical', label: 'Konstant Critical', description: 'Jeden Tag alle States critical' },
  { value: 'ok', label: 'Konstant OK', description: 'Jeden Tag alle States ok' },
  { value: 'random', label: 'Zufällig', description: 'Realistische Werte mit Zufall' },
]

const styles = StyleSheet.create({
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  helperText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  checkboxRowPressed: {
    opacity: 0.82,
  },
  inlineCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineCheckboxSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(127, 211, 138, 0.12)',
  },
  inlineCheckboxMark: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  checkboxRowText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  selectorLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  selectorList: {
    gap: 10,
  },
  dropdownBlock: {
    gap: 10,
  },
  dropdownButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  dropdownChevron: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  dropdownPanel: {
    backgroundColor: colors.background,
    borderRadius: 22,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    maxHeight: '70%',
  },
  dropdownTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  selectorCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
  },
  selectorCardSelected: {
    borderColor: colors.accent,
  },
  selectorCardPressed: {
    opacity: 0.92,
  },
  selectorCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  selectorCardCopy: {
    flex: 1,
    gap: 4,
  },
  selectorCardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  selectorCardText: {
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
  inputGrid: {
    gap: 12,
  },
  inputCard: {
    gap: 10,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    backgroundColor: colors.surface,
    padding: 14,
  },
  textInput: {
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  shortcutRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  shortcutButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  shortcutButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  stepInputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
    marginTop: 10,
  },
  stepInputLabelColumn: {
    flex: 1,
    gap: 8,
  },
  stepInputLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  stepButtonColumn: {
    gap: 8,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonText: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 22,
  },
  previewPanel: {
    gap: 10,
    padding: 16,
    borderRadius: 20,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  previewCard: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 100,
    borderRadius: 16,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.background,
    padding: 12,
    gap: 6,
  },
  previewLabel: {
    color: colors.muted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
  },
  previewValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  stateBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stateBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.accentText,
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderColor: colors.border,
    borderWidth: 1,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  batchPanel: {
    gap: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
  },
  success: {
    color: colors.success,
    backgroundColor: 'rgba(127, 211, 138, 0.12)',
    borderColor: 'rgba(127, 211, 138, 0.3)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    lineHeight: 20,
  },
  error: {
    color: colors.critical,
    backgroundColor: 'rgba(255, 140, 140, 0.12)',
    borderColor: 'rgba(255, 140, 140, 0.3)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    lineHeight: 20,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
