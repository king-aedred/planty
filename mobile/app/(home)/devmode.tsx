import { Colors } from '@/constants/colors'
import { api } from '../../../convex/_generated/api'
import BurgerMenu from '../../components/burger-menu'
import TimeTravelTab from '../../components/devmode/time-travel-tab'
import { useQuery } from 'convex/react'
import { useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const colors = Colors.dark
const REQUEST_TIMEOUT_MS = 8000

type SensorResult = {
  deviceId?: string
  plantName?: string
  ok?: boolean
  errorMessage?: string
  status?: number
  responseText?: string
  sensor_id?: string
  scenario?: string
  success?: boolean
  message?: string
}

const SERVER_CANDIDATES = [
  process.env.EXPO_PUBLIC_DEV_SERVER_URL?.trim(),
  Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000',
  'http://100.86.32.59:3000',
].filter((value): value is string => Boolean(value))

type DevInfo = {
  cron_interval_minutes: number
  min_readings_required: number
}

type RequestDebug = {
  label: string
  url: string
  method: string
  status?: number
  responseText?: string
  errorName?: string
  errorMessage?: string
}

type ProbeAttempt = {
  url: string
  errorName?: string
  errorMessage?: string
  status?: number
}

type DevTab = 'single' | 'multi' | 'timeTravel'

type ScenarioKey =
  | 'normal'
  | 'minimal'
  | 'insufficient'
  | 'all_critical'
  | 'all_ok'
  | 'all_warning'
  | 'duplicate'
  | 'offline'

type PlantRow = {
  _id: string | { toString(): string }
  name: string
  device_id?: string | null
  sensor_id?: string | null
}

type SensorPlant = {
  id: string
  name: string
  deviceId: string
}

export default function DevModeScreen() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuth, useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { getToken } = useAuth()
  const { user } = useUser()
  const router = useRouter()

  const clerkId = user?.id ?? ''
  const plants = useQuery(api.plants.getAllPlantsByClerkId, clerkId ? { clerk_id: clerkId } : 'skip')
  const isDevUser = useQuery(api.users.isDevUser, clerkId ? { clerk_id: clerkId } : 'skip')

  const [activeTab, setActiveTab] = useState<DevTab>('single')
  const [selectedSinglePlantId, setSelectedSinglePlantId] = useState('')
  const [selectedMultiPlantIds, setSelectedMultiPlantIds] = useState<Record<string, boolean>>({})
  const [selectedScenario, setSelectedScenario] = useState<ScenarioKey>('normal')
  const [devInfo, setDevInfo] = useState<DevInfo | null>(null)
  const [serverBaseUrl, setServerBaseUrl] = useState<string | null>(null)
  const [probeAttempts, setProbeAttempts] = useState<ProbeAttempt[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [requestDebug, setRequestDebug] = useState<RequestDebug | null>(null)
  const [multiResults, setMultiResults] = useState<SensorResult[]>([])
  const [isSingleDropdownOpen, setIsSingleDropdownOpen] = useState(false)
  const [overrideContactWindow, setOverrideContactWindow] = useState(false)

  const getAuthorizationHeaders = async (): Promise<Record<string, string>> => {
    const token = await getToken({ template: 'convex' })

    if (!token) {
      throw new Error('Kein Clerk Session Token verfügbar')
    }

    return {
      Authorization: `Bearer ${token}`,
    }
  }

  const deviceId = useMemo(() => {
    const firstPlant = plants?.[0]

    return firstPlant?.device_id ?? firstPlant?.sensor_id ?? ''
  }, [plants])

  const sensorPlants = useMemo<SensorPlant[]>(() => {
    return ((plants ?? []) as PlantRow[])
      .map((plant) => ({
        id: String(plant._id),
        name: plant.name,
        deviceId: plant.device_id ?? plant.sensor_id ?? '',
      }))
      .filter((plant) => Boolean(plant.deviceId))
  }, [plants])

  const selectedSinglePlant = useMemo(
    () => sensorPlants.find((plant) => plant.id === selectedSinglePlantId) ?? sensorPlants[0] ?? null,
    [sensorPlants, selectedSinglePlantId],
  )

  useEffect(() => {
    if (sensorPlants.length === 0) {
      setSelectedSinglePlantId('')
      setSelectedMultiPlantIds({})
      return
    }

    setSelectedSinglePlantId((current) => {
      if (current && sensorPlants.some((plant) => plant.id === current)) {
        return current
      }

      return sensorPlants[0].id
    })

    setSelectedMultiPlantIds((current) => {
      const nextSelection: Record<string, boolean> = {}

      for (const plant of sensorPlants) {
        nextSelection[plant.id] = current[plant.id] ?? true
      }

      return nextSelection
    })
  }, [sensorPlants])

  useEffect(() => {
    let cancelled = false

    const resolveServerUrl = async () => {
      const attempts: ProbeAttempt[] = []

      for (const candidate of SERVER_CANDIDATES) {
        try {
          setRequestDebug({
            label: 'dev/probe',
            url: `${candidate}/`,
            method: 'GET',
          })

          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

          const response = await fetch(`${candidate}/`, {
            signal: controller.signal,
          })

          clearTimeout(timeout)

          if (cancelled) {
            return
          }

          if (response.ok || response.status >= 200) {
            attempts.push({ url: candidate, status: response.status })
            setProbeAttempts(attempts)
            setServerBaseUrl(candidate)
            setRequestDebug({
              label: 'dev/probe',
              url: `${candidate}/`,
              method: 'GET',
              status: response.status,
              responseText: await response.text(),
            })
            return
          }
        } catch (error) {
          const errorName = error instanceof Error ? error.name : 'Error'
          const errorMessage = error instanceof Error ? error.message : 'Server probe failed'

          attempts.push({
            url: candidate,
            errorName,
            errorMessage,
          })
          setProbeAttempts([...attempts])

          setRequestDebug({
            label: 'dev/probe',
            url: `${candidate}/`,
            method: 'GET',
            errorName,
            errorMessage,
          })
        }
      }

      if (!cancelled) {
        const summary = attempts
          .map((attempt) => {
            if (attempt.status) {
              return `${attempt.url} -> ${attempt.status}`
            }

            return `${attempt.url} -> ${attempt.errorName ?? 'Error'}: ${attempt.errorMessage ?? 'unknown'}`
          })
          .join(' | ')

        const androidHint =
          Platform.OS === 'android'
            ? 'Falls du einen echten Android-Client nutzt, musst du nach Cleartext-Änderungen den Dev-Client neu bauen.'
            : ''

        setErrorMessage(
          `Kein erreichbarer Dev-Server gefunden. Geprüft: ${SERVER_CANDIDATES.join(', ')}${summary ? ` | ${summary}` : ''}${androidHint ? ` | ${androidHint}` : ''}`,
        )
      }
    }

    void resolveServerUrl()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!serverBaseUrl) {
      return
    }

    if (isDevUser === false) {
      router.replace('/(home)/status')
      return
    }

    const loadInfo = async () => {
      try {
        const debugLabel = 'dev/info'
        const url = `${serverBaseUrl}/dev/info`
        setRequestDebug({
          label: debugLabel,
          url,
          method: 'GET',
        })

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        const authorizationHeaders = await getAuthorizationHeaders()

        const response = await fetch(url, {
          headers: authorizationHeaders,
          signal: controller.signal,
        })

        clearTimeout(timeout)

        if (!response.ok) {
          const responseText = await response.text()
          setRequestDebug({
            label: debugLabel,
            url,
            method: 'GET',
            status: response.status,
            responseText,
          })
          throw new Error(`Info request failed: ${response.status}`)
        }

        const info = (await response.json()) as DevInfo
        setDevInfo(info)
        setRequestDebug({
          label: debugLabel,
          url,
          method: 'GET',
          status: response.status,
          responseText: JSON.stringify(info, null, 2),
        })
      } catch (error) {
        const errorName = error instanceof Error ? error.name : 'Error'
        const errorMessage = error instanceof Error ? error.message : 'Konnte Dev Infos nicht laden'

        setRequestDebug((current) =>
          current
            ? {
                ...current,
                errorName,
                errorMessage,
              }
            : {
                label: 'dev/info',
                url: `${serverBaseUrl ?? SERVER_CANDIDATES[0]}/dev/info`,
                method: 'GET',
                errorName,
                errorMessage,
              },
        )
        setErrorMessage(errorMessage)
      }
    }

    void loadInfo()
  }, [clerkId, isDevUser, router, serverBaseUrl])

  if (isDevUser === false) {
    return null
  }

  const runScenarioRequest = async (targetDeviceId: string, scenario: string) => {
    if (!targetDeviceId || !serverBaseUrl) {
      return
    }

    setIsLoading(true)
    setErrorMessage('')
    setStatusMessage('')
    setRequestDebug({
      label: 'dev/simulate',
      url: `${serverBaseUrl}/dev/simulate`,
      method: 'POST',
    })

    try {
      const url = `${serverBaseUrl}/dev/simulate`
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      const authorizationHeaders = await getAuthorizationHeaders()

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authorizationHeaders,
        },
        signal: controller.signal,
        body: JSON.stringify({
          device_id: targetDeviceId,
          scenario,
          override_contact_window: overrideContactWindow,
        }),
      })

      clearTimeout(timeout)

      const responseBody = await response.json()

      if (!response.ok) {
        setRequestDebug({
          label: 'dev/simulate',
          url,
          method: 'POST',
          status: response.status,
          responseText: JSON.stringify(responseBody, null, 2),
        })
        throw new Error(responseBody?.error ?? 'Simulation fehlgeschlagen')
      }

      setRequestDebug({
        label: 'dev/simulate',
        url,
        method: 'POST',
        status: response.status,
        responseText: JSON.stringify(responseBody, null, 2),
      })
      setStatusMessage(JSON.stringify(responseBody, null, 2))
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'Error'
      const errorMessage = error instanceof Error ? error.message : 'Simulation fehlgeschlagen'

      setRequestDebug((current) =>
        current
          ? {
              ...current,
              errorName,
              errorMessage,
            }
          : {
              label: 'dev/simulate',
              url: `${serverBaseUrl ?? SERVER_CANDIDATES[0]}/dev/simulate`,
              method: 'POST',
              errorName,
              errorMessage,
            },
      )
      setErrorMessage(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const sendScenario = async (targetDeviceId: string, scenario: string) => {
    if (!targetDeviceId || isLoading) {
      return
    }

    return await runScenarioRequest(targetDeviceId, scenario)
  }

  const simulateSensorRequest = async (plant: SensorPlant, scenario: ScenarioKey): Promise<SensorResult> => {
    if (!serverBaseUrl) {
      return {
        deviceId: plant.deviceId,
        plantName: plant.name,
        ok: false,
        errorMessage: 'Backend URL fehlt',
      }
    }

    const url = `${serverBaseUrl}/dev/simulate`

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      const authorizationHeaders = await getAuthorizationHeaders()

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authorizationHeaders,
        },
        signal: controller.signal,
        body: JSON.stringify({
          device_id: plant.deviceId,
          scenario,
          override_contact_window: overrideContactWindow,
        }),
      })

      clearTimeout(timeout)

      const responseBody = await response.json()
      const responseText = JSON.stringify(responseBody, null, 2)

      if (!response.ok) {
        return {
          deviceId: plant.deviceId,
          plantName: plant.name,
          ok: false,
          status: response.status,
          responseText,
          errorMessage: responseBody?.error ?? 'Simulation fehlgeschlagen',
        }
      }

      return {
        deviceId: plant.deviceId,
        plantName: plant.name,
        ok: true,
        status: response.status,
        responseText,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Simulation fehlgeschlagen'

      return {
        deviceId: plant.deviceId,
        plantName: plant.name,
        ok: false,
        errorMessage,
      }
    }
  }

  const toggleMultiPlant = (plantId: string) => {
    setSelectedMultiPlantIds((current) => ({
      ...current,
      [plantId]: !current[plantId],
    }))
  }

  const handleMultiTest = async () => {
    if (isLoading || !serverBaseUrl) {
      return
    }

    const selectedPlants = sensorPlants.filter((plant) => selectedMultiPlantIds[plant.id])

    if (selectedPlants.length === 0) {
      setErrorMessage('Bitte wähle mindestens einen Sensor aus')
      return
    }

    setIsLoading(true)
    setStatusMessage('')
    setErrorMessage('')
    setMultiResults([])

    const settledResults = await Promise.allSettled(
      selectedPlants.map((plant) => simulateSensorRequest(plant, selectedScenario)),
    )

    const results: SensorResult[] = settledResults.map((settled, index) => {
      const plant = selectedPlants[index]

      if (settled.status === 'fulfilled') {
        return settled.value
      }

      return {
        deviceId: plant.deviceId,
        plantName: plant.name,
        ok: false,
        errorMessage: settled.reason instanceof Error ? settled.reason.message : 'Simulation fehlgeschlagen',
      }
    })

    setMultiResults(results)

    setStatusMessage(`${results.filter((result) => result.ok).length}/${results.length} Sensor erfolgreich getestet`)
    setIsLoading(false)
  }

  const triggerCron = async () => {
    if (isLoading || !serverBaseUrl) {
      return
    }

    setIsLoading(true)
    setErrorMessage('')
    setStatusMessage('')
    setRequestDebug({
      label: 'dev/trigger-cron',
      url: `${serverBaseUrl}/dev/trigger-cron`,
      method: 'POST',
    })

    try {
      const url = `${serverBaseUrl}/dev/trigger-cron`
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      const authorizationHeaders = await getAuthorizationHeaders()

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...authorizationHeaders,
        },
        signal: controller.signal,
      })

      clearTimeout(timeout)

      const responseBody = await response.json()

      if (!response.ok) {
        setRequestDebug({
          label: 'dev/trigger-cron',
          url,
          method: 'POST',
          status: response.status,
          responseText: JSON.stringify(responseBody, null, 2),
        })
        throw new Error(responseBody?.error ?? 'CronJob konnte nicht getriggert werden')
      }

      setRequestDebug({
        label: 'dev/trigger-cron',
        url,
        method: 'POST',
        status: response.status,
        responseText: JSON.stringify(responseBody, null, 2),
      })
      setStatusMessage(JSON.stringify(responseBody, null, 2))
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'Error'
      const errorMessage = error instanceof Error ? error.message : 'CronJob konnte nicht getriggert werden'

      setRequestDebug((current) =>
        current
          ? {
              ...current,
              errorName,
              errorMessage,
            }
          : {
              label: 'dev/trigger-cron',
              url: `${serverBaseUrl ?? SERVER_CANDIDATES[0]}/dev/trigger-cron`,
              method: 'POST',
              errorName,
              errorMessage,
            },
      )
      setErrorMessage(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.container}>
            <BurgerMenu deviceId={selectedSinglePlant?.deviceId || deviceId || undefined} />

            <View style={styles.hero}>
              <Text style={styles.eyebrow}>Planty</Text>
              <Text style={styles.title}>Dev Tools 🛠️</Text>
              <Text style={styles.meta}>Aktuelle User ID</Text>
              <Text style={styles.value}>{clerkId || 'Keine User ID gefunden'}</Text>
              <Text style={styles.meta}>Aktive Device ID</Text>
              <Text style={styles.value}>{selectedSinglePlant?.deviceId || deviceId || 'Keine Device ID gefunden'}</Text>
            </View>

            <View style={styles.tabRow}>
              <TabButton label="Single Sensor" active={activeTab === 'single'} onPress={() => setActiveTab('single')} />
              <TabButton label="Multi Sensor" active={activeTab === 'multi'} onPress={() => setActiveTab('multi')} />
              <TabButton label="⏰ Zeitreise" active={activeTab === 'timeTravel'} onPress={() => setActiveTab('timeTravel')} />
            </View>

            {activeTab === 'single' ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Single Sensor</Text>
                <Text style={styles.helperText}>Wähle eine Pflanze mit Sensor aus und teste dann die vorhandenen Szenarien.</Text>

                <View style={styles.dropdownBlock}>
                  <Text style={styles.selectorLabel}>Sensor auswählen</Text>
                  {selectedSinglePlant ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setIsSingleDropdownOpen((current) => !current)}
                      style={({ pressed }) => [styles.dropdownButton, pressed && styles.selectorCardPressed]}
                    >
                      <View style={styles.selectorCardCopy}>
                        <Text style={styles.selectorCardTitle}>{selectedSinglePlant.name}</Text>
                        <Text style={styles.selectorCardText}>{selectedSinglePlant.deviceId}</Text>
                      </View>
                      <Text style={styles.dropdownChevron}>{isSingleDropdownOpen ? '▴' : '▾'}</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.helperText}>Keine Pflanzen mit Sensor gefunden.</Text>
                  )}

                  <Modal visible={isSingleDropdownOpen} transparent animationType="fade" onRequestClose={() => setIsSingleDropdownOpen(false)}>
                    <Pressable style={styles.modalBackdrop} onPress={() => setIsSingleDropdownOpen(false)}>
                      <Pressable style={styles.dropdownPanel} onPress={() => undefined}>
                        <Text style={styles.dropdownTitle}>Sensor auswählen</Text>
                        <View style={styles.selectorList}>
                          {sensorPlants.map((plant) => {
                            const isSelected = selectedSinglePlantId === plant.id

                            return (
                              <Pressable
                                key={plant.id}
                                accessibilityRole="button"
                                onPress={() => {
                                  setSelectedSinglePlantId(plant.id)
                                  setIsSingleDropdownOpen(false)
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

                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: overrideContactWindow }}
                  onPress={() => setOverrideContactWindow((current) => !current)}
                  style={({ pressed }) => [styles.checkboxRow, pressed && styles.checkboxRowPressed]}
                >
                  <View style={[styles.inlineCheckbox, overrideContactWindow && styles.inlineCheckboxSelected]}>
                    {overrideContactWindow ? <View style={styles.inlineCheckboxMark} /> : null}
                  </View>
                  <Text style={styles.checkboxRowText}>☑ Kontaktzeitfenster ignorieren</Text>
                </Pressable>

                <View style={styles.buttonGrid}>
                  {scenarioButtons.map((button) => (
                    <Pressable
                      key={button.scenario}
                      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, isLoading && styles.buttonDisabled]}
                      disabled={isLoading || !selectedSinglePlant?.deviceId}
                      onPress={() => void sendScenario(selectedSinglePlant?.deviceId ?? '', button.scenario)}
                    >
                      <Text style={styles.buttonText}>{button.label}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.resultPanel}>
                  <Text style={styles.resultTitle}>Ergebnis</Text>
                  {statusMessage ? <Text style={styles.success}>{statusMessage}</Text> : <Text style={styles.helperText}>Noch kein Test ausgeführt.</Text>}
                </View>
              </View>
            ) : null}

            {activeTab === 'multi' ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Multi Sensor</Text>
                <Text style={styles.helperText}>Alle ausgewählten Sensoren erhalten dasselbe Szenario. Die Ergebnisse erscheinen pro Sensor.</Text>

                <View style={styles.selectorList}>
                  {sensorPlants.length > 0 ? (
                    sensorPlants.map((plant) => {
                      const selected = Boolean(selectedMultiPlantIds[plant.id])

                      return (
                        <Pressable
                          key={plant.id}
                          accessibilityRole="button"
                          onPress={() => toggleMultiPlant(plant.id)}
                          style={({ pressed }) => [
                            styles.selectorCard,
                            selected && styles.selectorCardSelected,
                            pressed && styles.selectorCardPressed,
                          ]}
                        >
                          <View style={styles.selectorCardHeader}>
                            <View style={styles.selectorCardCopy}>
                              <Text style={styles.selectorCardTitle}>{plant.name}</Text>
                              <Text style={styles.selectorCardText}>{plant.deviceId}</Text>
                            </View>
                            <View style={selected ? styles.checkboxSelected : styles.checkbox} />
                          </View>
                        </Pressable>
                      )
                    })
                  ) : (
                    <Text style={styles.helperText}>Keine Pflanzen mit Sensor gefunden.</Text>
                  )}
                </View>

                <View style={styles.scenarioPicker}>
                  <Text style={styles.selectorLabel}>Szenario wählen</Text>
                  <View style={styles.buttonGrid}>
                    {scenarioButtons.map((button) => {
                      const isSelected = selectedScenario === button.scenario

                      return (
                        <Pressable
                          key={button.scenario}
                          accessibilityRole="button"
                          onPress={() => setSelectedScenario(button.scenario)}
                          style={({ pressed }) => [
                            styles.button,
                            isSelected && styles.buttonSelected,
                            pressed && styles.buttonPressed,
                          ]}
                        >
                          <Text style={styles.buttonText}>{button.label}</Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => void handleMultiTest()}
                  disabled={isLoading || Object.values(selectedMultiPlantIds).every((value) => !value)}
                  style={({ pressed }) => [styles.cronButton, pressed && styles.buttonPressed, isLoading && styles.buttonDisabled]}
                >
                  <Text style={styles.cronButtonText}>{isLoading ? 'Teste…' : 'Alle testen'}</Text>
                </Pressable>

                <View style={styles.resultPanel}>
                  <Text style={styles.resultTitle}>Ergebnisse</Text>
                  {multiResults.length > 0 ? (
                    <View style={styles.resultList}>
                      {multiResults.map((result) => (
                        <View key={result.deviceId} style={styles.resultCard}>
                          <View style={styles.resultHeader}>
                            <Text style={styles.resultDeviceTitle}>{result.plantName}</Text>
                            <Text style={styles.resultDeviceId}>{result.deviceId}</Text>
                          </View>
                          <Text style={result.ok ? styles.success : styles.error}>
                            {result.ok ? 'OK' : result.errorMessage ?? 'Fehlgeschlagen'}
                          </Text>
                          {result.status ? <Text style={styles.resultMeta}>Status {result.status}</Text> : null}
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.helperText}>Noch keine Mehrsensor-Tests ausgeführt.</Text>
                  )}
                </View>
              </View>
            ) : null}

            {activeTab === 'timeTravel' ? (
              <TimeTravelTab
                plants={sensorPlants}
                serverBaseUrl={serverBaseUrl}
                getAuthorizationHeaders={getAuthorizationHeaders}
                overrideContactWindow={overrideContactWindow}
                onToggleOverrideContactWindow={() => setOverrideContactWindow((current) => !current)}
              />
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Dev Infos</Text>
              <InfoRow label="Backend URL" value={serverBaseUrl ?? 'Suche…'} />
              <InfoRow label="CronJob Intervall" value={devInfo ? `${devInfo.cron_interval_minutes} Minuten` : 'Lädt…'} />
              <InfoRow label="Min. Readings Required" value={devInfo ? String(devInfo.min_readings_required) : 'Lädt…'} />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Debug</Text>
              <InfoRow label="Request" value={requestDebug ? `${requestDebug.method} ${requestDebug.label}` : 'Noch kein Request'} />
              <InfoRow label="Status" value={requestDebug?.status ? String(requestDebug.status) : 'n/a'} />
              <InfoRow label="Error" value={requestDebug?.errorName ? `${requestDebug.errorName}: ${requestDebug.errorMessage ?? ''}` : 'n/a'} />
              <InfoRow label="Probe Attempts" value={probeAttempts.length > 0 ? String(probeAttempts.length) : '0'} />
              {probeAttempts.length > 0 ? <Text style={styles.debugBlock}>{probeAttempts.map((attempt) => `${attempt.url} -> ${attempt.status ?? `${attempt.errorName ?? 'Error'}: ${attempt.errorMessage ?? 'unknown'}`}`).join('\n')}</Text> : null}
              {requestDebug?.responseText ? <Text style={styles.debugBlock}>{requestDebug.responseText}</Text> : null}
            </View>

            <Pressable style={({ pressed }) => [styles.cronButton, pressed && styles.buttonPressed, isLoading && styles.buttonDisabled]} disabled={isLoading} onPress={() => void triggerCron()}>
              <Text style={styles.cronButtonText}>Manuell CronJob triggern</Text>
            </Pressable>

            {isLoading ? <ActivityIndicator color={colors.accent} /> : null}
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const scenarioButtons = [
  { label: '✅ Normal Session (18/18)', scenario: 'normal' },
  { label: '⚠️ Minimale Session (12/18)', scenario: 'minimal' },
  { label: '❌ Unvollständig (8/18)', scenario: 'insufficient' },
  { label: '🔴 Alles Critical', scenario: 'all_critical' },
  { label: '🟢 Alles OK', scenario: 'all_ok' },
  { label: '🟡 Alles Warning', scenario: 'all_warning' },
  { label: '🔁 Duplikat Session', scenario: 'duplicate' },
  { label: '📴 Sensor Offline', scenario: 'offline' },
] as const

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.meta}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  )
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.tabButton, active && styles.tabButtonActive, pressed && styles.tabButtonPressed]}
    >
      <Text style={active ? styles.tabButtonTextActive : styles.tabButtonText}>{label}</Text>
    </Pressable>
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
    paddingTop: 48,
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
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
    marginBottom: 8,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tabButton: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabButtonActive: {
    borderColor: colors.accent,
    backgroundColor: '#123226',
  },
  tabButtonPressed: {
    opacity: 0.92,
  },
  tabButtonText: {
    color: colors.muted,
    fontWeight: '700',
  },
  tabButtonTextActive: {
    color: colors.accent,
    fontWeight: '800',
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  value: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
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
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  checkboxSelected: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  scenarioPicker: {
    gap: 10,
  },
  buttonGrid: {
    gap: 10,
  },
  button: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  buttonSelected: {
    borderColor: colors.accent,
  },
  cronButton: {
    backgroundColor: colors.accent,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  cronButtonText: {
    color: colors.accentText,
    fontSize: 15,
    fontWeight: '800',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
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
    color: colors.danger,
    backgroundColor: 'rgba(255, 140, 140, 0.12)',
    borderColor: 'rgba(255, 140, 140, 0.3)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    lineHeight: 20,
  },
  resultPanel: {
    gap: 10,
    padding: 16,
    borderRadius: 20,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  resultTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  resultList: {
    gap: 10,
  },
  resultCard: {
    borderRadius: 16,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  resultDeviceTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  resultDeviceId: {
    color: colors.muted,
    fontSize: 12,
  },
  resultMeta: {
    color: colors.muted,
    fontSize: 13,
  },
  infoRow: {
    gap: 4,
  },
  debugBlock: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
})