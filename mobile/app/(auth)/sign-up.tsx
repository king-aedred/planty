import { Colors } from '@/constants/colors'
import { Redirect, type Href, Link, useRouter } from 'expo-router'
import React from 'react'
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

export default function Page() {
  return <SignUpContent />
}

function SignUpContent() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuth, useSignUp } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { signUp, errors, fetchStatus } = useSignUp()
  const { isSignedIn } = useAuth()
  const router = useRouter()

  const [emailAddress, setEmailAddress] = React.useState('')
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [passwordConfirmation, setPasswordConfirmation] = React.useState('')
  const [legalAccepted, setLegalAccepted] = React.useState(false)
  const [code, setCode] = React.useState('')
  const [errorMessage, setErrorMessage] = React.useState('')
  const [verificationRequested, setVerificationRequested] = React.useState(false)

  if (!signUp) {
    return null
  }

  const isVerificationStep =
    verificationRequested ||
    (signUp.emailAddress !== null && signUp.verifications.emailAddress.status !== 'verified')

  const navigateToHome = (url: string) => {
    if (url.startsWith('http')) {
      if (typeof window !== 'undefined') {
        window.location.href = url
      }
      return
    }

    router.replace(url as Href)
  }

  const handleSubmit = async () => {
    setErrorMessage('')

    if (password !== passwordConfirmation) {
      setErrorMessage('Passwörter stimmen nicht überein.')
      return
    }

    try {
      const { error } = await signUp.password({
        emailAddress,
        username: username.trim() || undefined,
        password,
        legalAccepted,
      })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      const { error: sendCodeError } = await signUp.verifications.sendEmailCode()
      if (sendCodeError) {
        setErrorMessage(sendCodeError.message)
        return
      }

      setVerificationRequested(true)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Registrierung fehlgeschlagen.')
    }
  }

  const handleVerify = async () => {
    setErrorMessage('')

    try {
      const { error } = await signUp.verifications.verifyEmailCode({
        code: code.trim(),
      })

      if (error) {
        setErrorMessage(`Code konnte nicht bestätigt werden: ${error.message}`)
        return
      }

      if (signUp.status !== 'complete') {
        setErrorMessage(
          `Code akzeptiert, aber Clerk erwartet noch weitere Angaben. missing=${signUp.missingFields.join(', ') || 'unknown'}`,
        )
        return
      }

      const { error: finalizeError } = await signUp.finalize()

      if (finalizeError) {
        setErrorMessage(`Konto konnte nicht abgeschlossen werden: ${finalizeError.message}`)
        return
      }

      setVerificationRequested(false)
      navigateToHome('/(home)')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Verifizierung fehlgeschlagen.')
    }
  }

  const handleResendCode = async () => {
    setErrorMessage('')

    try {
      const { error } = await signUp.verifications.sendEmailCode()
      if (error) {
        setErrorMessage(error.message)
        return
      }

      setCode('')
      setVerificationRequested(true)
      setErrorMessage('Neuer Code wurde gesendet.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Code konnte nicht erneut gesendet werden.')
    }
  }

  if (signUp.status === 'complete' || isSignedIn) {
    return <Redirect href="/(home)" />
  }

  if (isVerificationStep) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.container}>
                <View style={styles.card}>
                  <Text style={styles.eyebrow}>Planty</Text>
                  <Text style={styles.title}>E-Mail bestätigen</Text>
                  <Text style={styles.subtitle}>
                    Gib den Code ein, den wir an deine E-Mail-Adresse geschickt haben.
                  </Text>

                  <Text style={styles.label}>Verifizierungscode</Text>
                  <TextInput
                    style={styles.input}
                    value={code}
                    placeholder="123456"
                    placeholderTextColor={colors.muted}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    autoCapitalize="none"
                  />

                  {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

                  <Pressable
                    style={({ pressed }) => [
                      styles.button,
                      !code && styles.buttonDisabled,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={handleVerify}
                    disabled={!code}
                  >
                    <Text style={styles.buttonText}>Code prüfen</Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                    onPress={handleResendCode}
                  >
                    <Text style={styles.secondaryButtonText}>Neuen Code senden</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.container}>
              <View style={styles.card}>
                <Text style={styles.eyebrow}>Planty</Text>
                <Text style={styles.title}>Konto erstellen</Text>
                <Text style={styles.subtitle}>Registriere dich mit E-Mail und Passwort.</Text>

                <Text style={styles.label}>Benutzername</Text>
                <TextInput
                  style={styles.input}
                  value={username}
                  placeholder="plantyfan"
                  placeholderTextColor={colors.muted}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                />

                <Text style={styles.label}>E-Mail-Adresse</Text>
                <TextInput
                  style={styles.input}
                  autoCapitalize="none"
                  value={emailAddress}
                  placeholder="name@beispiel.de"
                  placeholderTextColor={colors.muted}
                  onChangeText={setEmailAddress}
                  keyboardType="email-address"
                />

                <Text style={styles.label}>Passwort</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  placeholder="Mindestens 8 Zeichen"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  onChangeText={setPassword}
                />

                <Text style={styles.label}>Passwort bestätigen</Text>
                <TextInput
                  style={styles.input}
                  value={passwordConfirmation}
                  placeholder="Passwort erneut eingeben"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  onChangeText={setPasswordConfirmation}
                />

                <Pressable
                  style={({ pressed }) => [styles.checkboxRow, pressed && styles.checkboxRowPressed]}
                  onPress={() => setLegalAccepted((current) => !current)}
                >
                  <View style={[styles.checkbox, legalAccepted && styles.checkboxChecked]}>
                    {legalAccepted ? <Text style={styles.checkboxMark}>✓</Text> : null}
                  </View>
                  <Text style={styles.checkboxLabel}>Ich akzeptiere die Nutzungsbedingungen.</Text>
                </Pressable>

                {errors.fields.emailAddress ? (
                  <Text style={styles.error}>{errors.fields.emailAddress.message}</Text>
                ) : null}
                {errors.fields.username ? <Text style={styles.error}>{errors.fields.username.message}</Text> : null}
                {errors.fields.password ? <Text style={styles.error}>{errors.fields.password.message}</Text> : null}
                {errors.fields.legalAccepted ? <Text style={styles.error}>{errors.fields.legalAccepted.message}</Text> : null}

                {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    (!emailAddress || !username || !password || !passwordConfirmation || !legalAccepted || fetchStatus === 'fetching') && styles.buttonDisabled,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={handleSubmit}
                  disabled={!emailAddress || !username || !password || !passwordConfirmation || !legalAccepted || fetchStatus === 'fetching'}
                >
                  <Text style={styles.buttonText}>Sign up</Text>
                </Pressable>

                <View style={styles.linkRow}>
                  <Text style={styles.linkPrompt}>Schon ein Konto?</Text>
                  <Link href="/(auth)/sign-in">
                    <Text style={styles.link}>Sign in</Text>
                  </Link>
                </View>

                <View nativeID="clerk-captcha" />
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
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 28,
    padding: 20,
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
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 8,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  checkboxRowPressed: {
    opacity: 0.8,
  },
  checkbox: {
    width: 22,
    height: 22,
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
  checkboxMark: {
    color: colors.accentText,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 12,
  },
  checkboxLabel: {
    color: colors.text,
    fontSize: 14,
    flex: 1,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  linkPrompt: {
    color: colors.muted,
    fontSize: 14,
  },
  link: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    marginTop: -6,
  },
  debug: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 4,
  },
})