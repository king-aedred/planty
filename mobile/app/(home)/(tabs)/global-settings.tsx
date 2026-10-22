import { api } from '../../../../convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, Linking } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { Badge, type BadgeTone } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Card } from '../../../components/ui/card'
import { ErrorNotice } from '../../../components/ui/error-notice'
import { Screen } from '../../../components/ui/screen'
import { ScreenHeader } from '../../../components/ui/screen-header'
import { SectionLabel } from '../../../components/ui/section-label'
import { Stepper } from '../../../components/ui/stepper'
import { TAB_BAR_SPACE } from '../../../components/ui/tab-bar'
import { TextField } from '../../../components/ui/text-field'
import { ToggleChip } from '../../../components/ui/toggle-chip'

type NotificationRuleState = 'ok' | 'warning' | 'critical'
type NotificationChannel = 'push' | 'telegram' | 'call'
type NotificationRules = {
  ok: NotificationChannel[]
  warning: NotificationChannel[]
  critical: NotificationChannel[]
}

type UserSettingsPayload = {
  notification_rules?: NotificationRules
  contact_window_start?: number
  contact_window_end?: number
  measure_time?: string
  phone_number?: string
  max_notifications_per_day?: number
}

const notificationRuleStates: { key: NotificationRuleState; title: string; example: string; tone: BadgeTone }[] = [
  { key: 'ok', title: 'Alles gut', example: "Mir geht's super!", tone: 'success' },
  { key: 'warning', title: 'Braucht bald Aufmerksamkeit', example: 'Ich werde langsam durstig …', tone: 'warning' },
  { key: 'critical', title: 'Dringend', example: 'Hilfe! Ich verdurste!', tone: 'critical' },
]

const notificationChannels: Array<{ key: NotificationChannel; label: string; disabled?: boolean; hint?: string }> = [
  { key: 'push', label: 'Push' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'call', label: 'Anruf', disabled: true, hint: 'kommt bald' },
]

function createEmptyNotificationRules(): NotificationRules {
  return {
    ok: [],
    warning: [],
    critical: [],
  }
}

function normalizeNotificationRules(value: Partial<NotificationRules> | undefined | null): NotificationRules {
  const emptyRules = createEmptyNotificationRules()

  if (!value) {
    return emptyRules
  }

  const allowedChannels = new Set<NotificationChannel>(['push', 'telegram', 'call'])

  const normalizeChannelList = (channels: Array<string | NotificationChannel> | undefined) => {
    const nextChannels: NotificationChannel[] = []

    for (const channel of channels ?? []) {
      if (allowedChannels.has(channel as NotificationChannel) && !nextChannels.includes(channel as NotificationChannel)) {
        nextChannels.push(channel as NotificationChannel)
      }
    }

    return nextChannels
  }

  return {
    ok: normalizeChannelList(value.ok),
    warning: normalizeChannelList(value.warning),
    critical: normalizeChannelList(value.critical),
  }
}

export default function GlobalSettingsScreen() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user } = useUser()

  const clerkId = user?.id ?? ''
  const currentUser = useQuery(api.users.getUserByClerkId, clerkId ? { clerk_id: clerkId } : 'skip')
  const updateUserSettings = useMutation(api.users.updateUserSettings)
  const generateTelegramConnectCode = useMutation(api.users.generateTelegramConnectCode)
  const disconnectTelegram = useMutation(api.users.disconnectTelegram)

  const [measureTime, setMeasureTime] = useState('08:00')
  const [notificationRules, setNotificationRules] = useState(createEmptyNotificationRules())
  const [contactWindowStart, setContactWindowStart] = useState('9')
  const [contactWindowEnd, setContactWindowEnd] = useState('21')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [maxNotificationsPerDay, setMaxNotificationsPerDay] = useState(1)
  const [username, setUsername] = useState('')
  const [usernameMessage, setUsernameMessage] = useState('')
  const [usernameMessageKind, setUsernameMessageKind] = useState<'success' | 'error' | ''>('')
  const [timeError, setTimeError] = useState('')
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [isSavingUsername, setIsSavingUsername] = useState(false)
  const [isTelegramActionLoading, setIsTelegramActionLoading] = useState(false)

  const email = user?.primaryEmailAddress?.emailAddress ?? ''

  useEffect(() => {
    setUsername(user?.username ?? '')
  }, [user?.username])

  useEffect(() => {
    if (!currentUser) {
      return
    }

    if (typeof currentUser.measure_time === 'string') {
      setMeasureTime(currentUser.measure_time)
    }

    if (typeof currentUser.contact_window_start === 'number') {
      setContactWindowStart(String(currentUser.contact_window_start))
    }

    if (typeof currentUser.contact_window_end === 'number') {
      setContactWindowEnd(String(currentUser.contact_window_end))
    }

    setNotificationRules(normalizeNotificationRules(currentUser.notification_rules))
    setPhoneNumber(currentUser.phone_number ?? '')
    setMaxNotificationsPerDay(currentUser.max_notifications_per_day ?? 1)
  }, [currentUser])

  const handleSaveSettings = async () => {
    if (!clerkId || isSavingSettings) {
      return
    }

    setTimeError('')

    const measureTimeValue = normalizeTimeInput(measureTime)
    if (!measureTimeValue) {
      setTimeError('Messzeit muss im Format HH:MM angegeben werden.')
      return
    }

    const contactStartValue = normalizeHourInput(contactWindowStart)
    if (contactWindowStart.trim() && contactStartValue === null) {
      setTimeError('Von muss eine Zahl zwischen 0 und 23 sein.')
      return
    }

    const contactEndValue = normalizeHourInput(contactWindowEnd)
    if (contactWindowEnd.trim() && contactEndValue === null) {
      setTimeError('Bis muss eine Zahl zwischen 0 und 23 sein.')
      return
    }

    setIsSavingSettings(true)

    try {
      const settings: UserSettingsPayload = {
        notification_rules: normalizeNotificationRules(notificationRules),
        measure_time: measureTimeValue,
        phone_number: phoneNumber.trim() || undefined,
        max_notifications_per_day: maxNotificationsPerDay,
      }

      if (contactStartValue !== null) {
        settings.contact_window_start = contactStartValue
      }

      if (contactEndValue !== null) {
        settings.contact_window_end = contactEndValue
      }

      await updateUserSettings({
        clerk_id: clerkId,
        settings: settings as never,
      })

      Alert.alert('Gespeichert', 'Deine globalen Einstellungen wurden aktualisiert.')
    } catch (error) {
      Alert.alert('Fehler', error instanceof Error ? error.message : 'Einstellungen konnten nicht gespeichert werden')
    } finally {
      setIsSavingSettings(false)
    }
  }

  const handleSaveUsername = async () => {
    if (!user || isSavingUsername) {
      return
    }

    const nextUsername = username.trim().toLowerCase()

    if (nextUsername.length < 3) {
      setUsernameMessage('Der Username muss mindestens 3 Zeichen haben')
      setUsernameMessageKind('error')
      return
    }

    if (!/^[a-z0-9_]+$/.test(nextUsername)) {
      setUsernameMessage('Nur Kleinbuchstaben, Zahlen und Unterstriche erlaubt')
      setUsernameMessageKind('error')
      return
    }

    setIsSavingUsername(true)
    setUsernameMessage('')
    setUsernameMessageKind('')

    try {
      await user.update({ username: nextUsername })
      setUsername(nextUsername)
      setUsernameMessage('Username gespeichert')
      setUsernameMessageKind('success')
    } catch (error) {
      const clerkError = error as {
        code?: string
        errors?: Array<{ code?: string }>
      }
      const isUsernameTaken =
        clerkError.code === 'form_identifier_exists' || clerkError.errors?.some((entry) => entry.code === 'form_identifier_exists')

      setUsernameMessage(isUsernameTaken ? 'Dieser Username ist bereits vergeben' : 'Username konnte nicht gespeichert werden')
      setUsernameMessageKind('error')
    } finally {
      setIsSavingUsername(false)
    }
  }

  const handleConnectTelegram = async () => {
    if (!clerkId || isTelegramActionLoading) {
      return
    }

    setIsTelegramActionLoading(true)

    try {
      const code = await generateTelegramConnectCode()
      await Linking.openURL(`https://t.me/planty247_bot?start=${code}`)
    } catch (error) {
      Alert.alert('Fehler', error instanceof Error ? error.message : 'Telegram konnte nicht geöffnet werden')
    } finally {
      setIsTelegramActionLoading(false)
    }
  }

  const handleDisconnectTelegram = async () => {
    if (!clerkId || isTelegramActionLoading) {
      return
    }

    setIsTelegramActionLoading(true)

    try {
      await disconnectTelegram()
      Alert.alert('Getrennt', 'Telegram wurde von Planty getrennt.')
    } catch (error) {
      Alert.alert('Fehler', error instanceof Error ? error.message : 'Telegram konnte nicht getrennt werden')
    } finally {
      setIsTelegramActionLoading(false)
    }
  }

  return (
    <Screen scroll>
      <ScreenHeader eyebrow="Callgreen" title="Einstellungen" withMenu={false} />

      <Card>
        <SectionLabel>Messung</SectionLabel>
        <TextField label="Messzeit" value={measureTime} onChangeText={setMeasureTime} placeholder="08:00" autoCapitalize="none" />
      </Card>

      <Card>
        <SectionLabel>Telegram</SectionLabel>
        {currentUser?.telegram_chat_id ? (
          <>
            <Badge tone="success" label="Verbunden" />
            <Button variant="secondary" onPress={() => void handleDisconnectTelegram()} loading={isTelegramActionLoading}>
              Telegram trennen
            </Button>
          </>
        ) : (
          <>
            <Text fontFamily="$body" fontSize={14} lineHeight="$4" color="$textSecondary">
              Verbinde dein Telegram-Konto, dann können dir deine Pflanzen dort schreiben.
            </Text>
            <Button variant="secondary" onPress={() => void handleConnectTelegram()} loading={isTelegramActionLoading}>
              Mit Telegram verbinden
            </Button>
          </>
        )}
      </Card>

      <Card>
        <SectionLabel>Benachrichtigungen</SectionLabel>
        <Text fontFamily="$body" fontSize={13} lineHeight="$3" color="$textSecondary">
          Wähle je Zustand, wie dich deine Pflanzen erreichen.
        </Text>
        {notificationRuleStates.map((state, index) => (
          <YStack key={state.key} gap="$8" paddingTop={index > 0 ? '$12' : 0} borderTopWidth={index > 0 ? 1 : 0} borderColor="$border">
            <XStack alignItems="center" justifyContent="space-between" gap="$8">
              <Badge tone={state.tone} label={state.title} />
            </XStack>
            <Text fontFamily="$body" fontSize={13} color="$textSecondary">
              „{state.example}“
            </Text>
            <XStack gap="$8" flexWrap="wrap">
              {notificationChannels.map((channel) => (
                <ToggleChip
                  key={channel.key}
                  label={channel.label}
                  hint={channel.hint}
                  disabled={channel.disabled}
                  checked={notificationRules[state.key].includes(channel.key)}
                  onPress={() =>
                    setNotificationRules((current) => {
                      const nextValues = current[state.key].includes(channel.key)
                        ? current[state.key].filter((entry) => entry !== channel.key)
                        : [...current[state.key], channel.key]
                      return { ...current, [state.key]: nextValues }
                    })
                  }
                />
              ))}
            </XStack>
          </YStack>
        ))}
      </Card>

      <Card>
        <SectionLabel>Ruhezeiten</SectionLabel>
        <Text fontFamily="$body" fontSize={13} lineHeight="$3" color="$textSecondary">
          Nur in diesem Zeitfenster (volle Stunden, 0–23) schicken dir deine Pflanzen Nachrichten.
        </Text>
        <XStack gap="$8">
          <YStack flex={1}>
            <TextField label="Von" value={contactWindowStart} onChangeText={setContactWindowStart} placeholder="9" keyboardType="numeric" autoCapitalize="none" />
          </YStack>
          <YStack flex={1}>
            <TextField label="Bis" value={contactWindowEnd} onChangeText={setContactWindowEnd} placeholder="21" keyboardType="numeric" autoCapitalize="none" />
          </YStack>
        </XStack>
        <YStack gap="$8">
          <Text fontFamily="$body" fontWeight="600" fontSize={13} color="$textPrimary">
            Höchstens Nachrichten pro Tag
          </Text>
          <Stepper value={maxNotificationsPerDay} min={1} max={10} onChange={setMaxNotificationsPerDay} />
        </YStack>
        <TextField label="Telefonnummer (optional)" value={phoneNumber} onChangeText={setPhoneNumber} placeholder="Für Anrufe, kommt bald" keyboardType="phone-pad" autoCapitalize="none" />
        {timeError ? <ErrorNotice message={timeError} /> : null}
      </Card>

      <Button onPress={() => void handleSaveSettings()} loading={isSavingSettings}>
        Einstellungen speichern
      </Button>

      <Card>
        <SectionLabel>Profil</SectionLabel>
        <TextField label="E-Mail" value={email} onChangeText={() => undefined} editable={false} />
        <TextField
          label="Benutzername"
          value={username}
          onChangeText={(text) => {
            setUsername(text.toLowerCase())
            setUsernameMessage('')
            setUsernameMessageKind('')
          }}
          placeholder="dein_name"
          autoCapitalize="none"
        />
        <Text fontFamily="$body" fontSize={12} color={usernameMessageKind === 'error' ? '$critical' : usernameMessageKind === 'success' ? '$success' : '$textSecondary'}>
          {usernameMessage || 'Nur Kleinbuchstaben, Zahlen und Unterstriche.'}
        </Text>
        <Button variant="secondary" onPress={() => void handleSaveUsername()} disabled={!username.trim()} loading={isSavingUsername}>
          Benutzername speichern
        </Button>
      </Card>

      <AccountSection />
      <YStack height={TAB_BAR_SPACE} />
    </Screen>
  )
}

function normalizeTimeInput(value: string) {
  const match = value.trim().match(/^(\d{2}):(\d{2})$/)

  if (!match) {
    return null
  }

  const hour = Number(match[1])
  const minute = Number(match[2])

  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return null
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function normalizeHourInput(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  const parsed = Number.parseInt(trimmed, 10)

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) {
    return null
  }

  return parsed
}

// Konto: früher im Burger-Menü, seit der Tab-Navigation hier.
function AccountSection() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuth, useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { signOut } = useAuth()
  const { user } = useUser()
  const router = useRouter()
  const clerkId = user?.id ?? ''
  const isDevUser = useQuery(api.users.isDevUser, clerkId ? { clerk_id: clerkId } : 'skip')

  const handleLogout = async () => {
    await signOut()
    router.replace('/(auth)/sign-in?logout=1')
  }

  return (
    <Card>
      <SectionLabel>Konto</SectionLabel>
      {isDevUser ? (
        <Button variant="secondary" onPress={() => router.push('/(home)/devmode')}>
          Dev Tools
        </Button>
      ) : null}
      <Button variant="danger" onPress={() => void handleLogout()}>
        Ausloggen
      </Button>
    </Card>
  )
}
