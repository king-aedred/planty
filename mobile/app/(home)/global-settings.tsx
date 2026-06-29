import { Colors } from '@/constants/colors'
import { api } from '../../../convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
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

export default function GlobalSettingsScreen() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user } = useUser()
  const router = useRouter()

  const clerkId = user?.id ?? ''
  const currentUser = useQuery(api.users.getUserByClerkId, clerkId ? { clerk_id: clerkId } : 'skip')
  const updateUserSettings = useMutation(api.users.updateUserSettings)

  const [measureTime, setMeasureTime] = useState('08:00')
  const [notificationPush, setNotificationPush] = useState(true)
  const [notificationTelegram, setNotificationTelegram] = useState(false)
  const [notificationPlantyMessenger, setNotificationPlantyMessenger] = useState(false)
  const [notificationCall, setNotificationCall] = useState(false)
  const [contactWindowStart, setContactWindowStart] = useState('9')
  const [contactWindowEnd, setContactWindowEnd] = useState('21')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [username, setUsername] = useState('')
  const [usernameMessage, setUsernameMessage] = useState('')
  const [usernameMessageKind, setUsernameMessageKind] = useState<'success' | 'error' | ''>('')
  const [timeError, setTimeError] = useState('')
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [isSavingUsername, setIsSavingUsername] = useState(false)

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

    setNotificationPush(currentUser.notification_push ?? true)
    setNotificationTelegram(currentUser.notification_telegram ?? false)
    setNotificationPlantyMessenger(currentUser.notification_planty_messenger ?? false)
    setNotificationCall(currentUser.notification_call ?? false)
    setPhoneNumber(currentUser.phone_number ?? '')
  }, [currentUser])

  const goBack = () => {
    router.back()
  }

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
      const settings: Record<string, string | number | boolean | undefined> = {
        notification_push: notificationPush,
        notification_telegram: notificationTelegram,
        notification_planty_messenger: notificationPlantyMessenger,
        notification_call: notificationCall,
        measure_time: measureTimeValue,
        phone_number: phoneNumber.trim() || undefined,
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

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
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
                <Text style={styles.title}>Globale Einstellungen</Text>
              </View>

              <Section title="Messung">
                <Field label="Messzeit" value={measureTime} onChangeText={setMeasureTime} placeholder="08:00" autoCapitalize="none" />
              </Section>

              <Section title="Benachrichtigungen">
                <CheckboxRow label="Push Notification" checked={notificationPush} onPress={() => setNotificationPush((value) => !value)} />
                <CheckboxRow label="Telegram" checked={notificationTelegram} onPress={() => setNotificationTelegram((value) => !value)} />
                <CheckboxRow
                  label="Planty Messenger"
                  checked={notificationPlantyMessenger}
                  onPress={() => setNotificationPlantyMessenger((value) => !value)}
                />
                <CheckboxRow
                  label="Anruf"
                  hint="Kommt bald"
                  checked={notificationCall}
                  onPress={() => setNotificationCall((value) => !value)}
                />

                <View style={styles.rowGroup}>
                  <Field label="Von" value={contactWindowStart} onChangeText={setContactWindowStart} placeholder="9" autoCapitalize="none" />
                  <Field label="Bis" value={contactWindowEnd} onChangeText={setContactWindowEnd} placeholder="21" autoCapitalize="none" />
                </View>

                {timeError ? <Text style={styles.feedbackError}>{timeError}</Text> : null}

                <Field label="Telefonnummer" value={phoneNumber} onChangeText={setPhoneNumber} placeholder="Optional" autoCapitalize="none" />
              </Section>

              <Section title="Account">
                <Field label="Email" value={email} onChangeText={() => undefined} editable={false} />

                <Field
                  label="Username"
                  value={username}
                  onChangeText={(text) => {
                    setUsername(text.toLowerCase())
                    setUsernameMessage('')
                    setUsernameMessageKind('')
                  }}
                  placeholder="dein_username"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={styles.helperText}>Nur Kleinbuchstaben, Zahlen und Unterstriche erlaubt</Text>

                {usernameMessage ? (
                  <Text style={[styles.feedbackText, usernameMessageKind === 'success' ? styles.feedbackSuccess : styles.feedbackError]}>{usernameMessage}</Text>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  onPress={() => void handleSaveUsername()}
                  disabled={isSavingUsername || !username.trim()}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, (isSavingUsername || !username.trim()) && styles.secondaryButtonDisabled]}
                >
                  <Text style={styles.secondaryButtonText}>{isSavingUsername ? 'Speichere…' : 'Speichern'}</Text>
                </Pressable>
              </Section>

              <Pressable
                accessibilityRole="button"
                onPress={() => void handleSaveSettings()}
                disabled={isSavingSettings}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, isSavingSettings && styles.primaryButtonDisabled]}
              >
                <Text style={styles.primaryButtonText}>{isSavingSettings ? 'Speichere…' : 'Einstellungen speichern'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
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

function CheckboxRow({ label, hint, checked, onPress }: { label: string; hint?: string; checked: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.checkboxRow, pressed && styles.pressed]}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked ? <Text style={styles.checkboxCheck}>✓</Text> : null}</View>
      <View style={styles.checkboxTextBlock}>
        <Text style={styles.checkboxLabel}>{label}</Text>
        {hint ? <Text style={styles.checkboxHint}>{hint}</Text> : null}
      </View>
    </Pressable>
  )
}

function Field({
  label,
  value,
  onChangeText,
  placeholder = '',
  autoCapitalize = 'none',
  editable = true,
  autoCorrect = true,
}: {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
  editable?: boolean
  autoCorrect?: boolean
}) {
  return (
    <View style={styles.fieldWrapper}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        editable={editable}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        style={[styles.input, !editable && styles.inputDisabled]}
      />
    </View>
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
    gap: 12,
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
  inputDisabled: {
    opacity: 0.8,
  },
  helperText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkboxCheck: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: '900',
    marginTop: -1,
  },
  checkboxTextBlock: {
    flex: 1,
    gap: 2,
  },
  checkboxLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  checkboxHint: {
    color: colors.muted,
    fontSize: 12,
  },
  rowGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  clockPicker: {
    gap: 8,
    flex: 1,
  },
  clockPickerCompact: {
    minWidth: 0,
  },
  clockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  clockSeparator: {
    color: colors.muted,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 18,
  },
  pickerColumn: {
    flex: 1,
    maxHeight: 168,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    backgroundColor: colors.background,
  },
  pickerColumnContent: {
    padding: 6,
    gap: 6,
  },
  pickerItem: {
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  pickerItemSelected: {
    backgroundColor: colors.accent,
  },
  pickerItemText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  pickerItemTextSelected: {
    color: colors.accentText,
  },
  feedbackText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: -2,
  },
  feedbackSuccess: {
    color: colors.success,
  },
  feedbackError: {
    color: colors.danger,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonDisabled: {
    opacity: 0.7,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.86,
  },
})