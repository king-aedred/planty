import { Colors } from '@/constants/colors'
import { api } from '../../../convex/_generated/api'
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

const hourOptions = Array.from({ length: 24 }, (_, index) => String(index))

export default function GlobalSettingsScreen() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuth, useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user } = useUser()
  const { signOut } = useAuth()
  const router = useRouter()

  const clerkId = user?.id ?? ''
  const currentUser = useQuery(api.users.getUserByClerkId, clerkId ? { clerk_id: clerkId } : 'skip')
  const updateUserSettings = useMutation(api.users.updateUserSettings)

  const [measureTime, setMeasureTime] = useState('08:00')
  const [notificationPush, setNotificationPush] = useState(true)
  const [notificationTelegram, setNotificationTelegram] = useState(false)
  const [notificationPlantyMessenger, setNotificationPlantyMessenger] = useState(false)
  const [notificationCall, setNotificationCall] = useState(false)
  const [contactWindowStart, setContactWindowStart] = useState('8')
  const [contactWindowEnd, setContactWindowEnd] = useState('20')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const email = currentUser?.email ?? user?.primaryEmailAddress?.emailAddress ?? ''

  const resolvedSettings = useMemo(() => {
    return {
      measureTime,
      notificationPush,
      notificationTelegram,
      notificationPlantyMessenger,
      notificationCall,
      contactWindowStart,
      contactWindowEnd,
      phoneNumber,
    }
  }, [
    contactWindowEnd,
    contactWindowStart,
    measureTime,
    notificationCall,
    notificationPlantyMessenger,
    notificationPush,
    notificationTelegram,
    phoneNumber,
  ])

  const goBack = () => {
    router.back()
  }

  const handleLogout = async () => {
    await signOut()
    router.replace('/(auth)/sign-in?logout=1')
  }

  const handleSave = async () => {
    if (!clerkId || isSaving) {
      return
    }

    setIsSaving(true)

    try {
      await updateUserSettings({
        clerk_id: clerkId,
        settings: {
          notification_push: resolvedSettings.notificationPush,
          notification_telegram: resolvedSettings.notificationTelegram,
          notification_planty_messenger: resolvedSettings.notificationPlantyMessenger,
          notification_call: resolvedSettings.notificationCall,
          contact_window_start: parseHour(resolvedSettings.contactWindowStart),
          contact_window_end: parseHour(resolvedSettings.contactWindowEnd),
          measure_time: normalizeTime(resolvedSettings.measureTime),
          phone_number: resolvedSettings.phoneNumber.trim() || undefined,
        },
      })

      Alert.alert('Gespeichert', 'Deine globalen Einstellungen wurden aktualisiert.')
    } catch (error) {
      Alert.alert('Fehler', error instanceof Error ? error.message : 'Einstellungen konnten nicht gespeichert werden')
    } finally {
      setIsSaving(false)
    }
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
                  <PickerField label="Kontaktzeit von" value={contactWindowStart} onChangeText={setContactWindowStart} options={hourOptions} />
                  <PickerField label="Kontaktzeit bis" value={contactWindowEnd} onChangeText={setContactWindowEnd} options={hourOptions} />
                </View>

                <Field label="Telefonnummer" value={phoneNumber} onChangeText={setPhoneNumber} placeholder="Optional" autoCapitalize="none" />
              </Section>

              <Section title="Account">
                <Field label="Email" value={email} onChangeText={() => undefined} editable={false} />

                <Pressable accessibilityRole="button" onPress={() => void handleLogout()} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                  <Text style={styles.secondaryButtonText}>Logout</Text>
                </Pressable>
              </Section>

              <Pressable
                accessibilityRole="button"
                onPress={() => void handleSave()}
                disabled={isSaving}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, isSaving && styles.primaryButtonDisabled]}
              >
                <Text style={styles.primaryButtonText}>{isSaving ? 'Speichere…' : 'Speichern'}</Text>
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

function PickerField({ label, value, onChangeText, options }: { label: string; value: string; onChangeText: (value: string) => void; options: string[] }) {
  return (
    <View style={styles.fieldWrapper}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerScroll}>
        {options.map((option) => {
          const selected = value === option

          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              onPress={() => onChangeText(option)}
              style={({ pressed }) => [styles.hourChip, selected && styles.hourChipSelected, pressed && styles.pressed]}
            >
              <Text style={[styles.hourChipText, selected && styles.hourChipTextSelected]}>{option.padStart(2, '0')}</Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

function Field({ label, value, onChangeText, placeholder = '', autoCapitalize = 'none', editable = true }: { label: string; value: string; onChangeText: (text: string) => void; placeholder?: string; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'; editable?: boolean }) {
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
        style={[styles.input, !editable && styles.inputDisabled]}
      />
    </View>
  )
}

function normalizeTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/)

  if (!match) {
    return undefined
  }

  const hour = Number(match[1])
  const minute = Number(match[2])

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return undefined
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function parseHour(value: string) {
  const hour = Number(value)

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return undefined
  }

  return hour
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
  pickerScroll: {
    gap: 8,
  },
  hourChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  hourChipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  hourChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  hourChipTextSelected: {
    color: colors.accentText,
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
  secondaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.86,
  },
})