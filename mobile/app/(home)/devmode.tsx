import { Colors } from '@/constants/colors'
import { api } from '../../../convex/_generated/api'
import BurgerMenu from '../../components/burger-menu'
import { useQuery } from 'convex/react'
import { useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const colors = Colors.dark
const REQUEST_TIMEOUT_MS = 8000

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

export default function DevModeScreen() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user } = useUser()
  const router = useRouter()

  const clerkId = user?.id ?? ''
  const plantByClerk = useQuery(api.plants.getPlantsByClerkId, clerkId ? { clerk_id: clerkId } : 'skip')
  const isDevUser = useQuery(api.users.isDevUser, clerkId ? { clerk_id: clerkId } : 'skip')

  const [devInfo, setDevInfo] = useState<DevInfo | null>(null)
  const [serverBaseUrl, setServerBaseUrl] = useState<string | null>(null)
  const [probeAttempts, setProbeAttempts] = useState<ProbeAttempt[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [requestDebug, setRequestDebug] = useState<RequestDebug | null>(null)

  const deviceId = useMemo(() => {
    const firstPlant = plantByClerk?.[0]

    return firstPlant?.device_id ?? firstPlant?.sensor_id ?? ''
  }, [plantByClerk])

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

        const response = await fetch(url, {
          headers: {
            'x-clerk-id': clerkId,
          },
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

  const sendScenario = async (scenario: string) => {
    if (!deviceId || isLoading || !serverBaseUrl) {
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

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-clerk-id': clerkId,
        },
        signal: controller.signal,
        body: JSON.stringify({
          device_id: deviceId,
          scenario,
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

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'x-clerk-id': clerkId,
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
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.container}>
            <BurgerMenu deviceId={deviceId} />

            <View style={styles.hero}>
              <Text style={styles.eyebrow}>Planty</Text>
              <Text style={styles.title}>Dev Tools 🛠️</Text>
              <Text style={styles.meta}>Aktuelle User ID</Text>
              <Text style={styles.value}>{clerkId || 'Keine User ID gefunden'}</Text>
              <Text style={styles.meta}>Aktuelle Device ID</Text>
              <Text style={styles.value}>{deviceId || 'Keine Device ID gefunden'}</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Sensor Simulieren</Text>
              <View style={styles.buttonGrid}>
                {scenarioButtons.map((button) => (
                  <Pressable
                    key={button.scenario}
                    style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, isLoading && styles.buttonDisabled]}
                    disabled={isLoading}
                    onPress={() => void sendScenario(button.scenario)}
                  >
                    <Text style={styles.buttonText}>{button.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable style={({ pressed }) => [styles.cronButton, pressed && styles.buttonPressed, isLoading && styles.buttonDisabled]} disabled={isLoading} onPress={triggerCron}>
                <Text style={styles.cronButtonText}>Manuell CronJob triggern</Text>
              </Pressable>

              {isLoading ? <ActivityIndicator color={colors.accent} /> : null}
              {statusMessage ? <Text style={styles.success}>{statusMessage}</Text> : null}
              {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Dev Infos</Text>
              <InfoRow label="Backend URL" value={serverBaseUrl ?? 'Suche…'} />
              <InfoRow label="CronJob Intervall" value={devInfo ? `${devInfo.cron_interval_minutes} Minuten` : 'Lädt…'} />
              <InfoRow label="Min. Readings Required" value={devInfo ? String(devInfo.min_readings_required) : 'Lädt…'} />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Debug</Text>
              <InfoRow label="Server URL" value={serverBaseUrl ?? SERVER_CANDIDATES[0]} />
              <InfoRow label="Request" value={requestDebug ? `${requestDebug.method} ${requestDebug.label}` : 'Noch kein Request'} />
              <InfoRow label="Status" value={requestDebug?.status ? String(requestDebug.status) : 'n/a'} />
              <InfoRow label="Error" value={requestDebug?.errorName ? `${requestDebug.errorName}: ${requestDebug.errorMessage ?? ''}` : 'n/a'} />
              <InfoRow label="Probe Attempts" value={probeAttempts.length > 0 ? String(probeAttempts.length) : '0'} />
              {probeAttempts.length > 0 ? <Text style={styles.debugBlock}>{probeAttempts.map((attempt) => `${attempt.url} -> ${attempt.status ?? `${attempt.errorName ?? 'Error'}: ${attempt.errorMessage ?? 'unknown'}`}`).join('\n')}</Text> : null}
              {requestDebug?.responseText ? <Text style={styles.debugBlock}>{requestDebug.responseText}</Text> : null}
            </View>
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
    color: '#7FD38A',
    backgroundColor: 'rgba(127, 211, 138, 0.12)',
    borderColor: 'rgba(127, 211, 138, 0.3)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    lineHeight: 20,
  },
  error: {
    color: '#FF8C8C',
    backgroundColor: 'rgba(255, 140, 140, 0.12)',
    borderColor: 'rgba(255, 140, 140, 0.3)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    lineHeight: 20,
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