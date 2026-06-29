import { Colors } from '@/constants/colors'
import { type Href, Link, useRouter } from 'expo-router'
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
  return <SignInContent />
}

function SignInContent() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useSignIn } = require('@clerk/expo') as typeof import('@clerk/expo')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuth } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { signIn, errors, fetchStatus } = useSignIn()
  const { isLoaded, isSignedIn } = useAuth()
  const router = useRouter()

  const [emailAddress, setEmailAddress] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [verificationCode, setVerificationCode] = React.useState('')
  const [verificationStrategy, setVerificationStrategy] = React.useState<'email_code' | 'phone_code' | null>(null)
  const [errorMessage, setErrorMessage] = React.useState('')

  const navigateToHome = (url: string) => {
    if (url.startsWith('http')) {
      if (typeof window !== 'undefined') {
        window.location.href = url
      }
      return
    }

    router.replace(url as Href)
  }

  React.useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigateToHome('/(home)')
    }
  }, [isLoaded, isSignedIn])

  if (!signIn) {
    return null
  }

  const handleSubmit = async () => {
    setErrorMessage('')

    try {
      const { error } = await signIn.password({
        identifier: emailAddress,
        password,
      })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      if (signIn.status === 'needs_client_trust') {
        const emailFactor = signIn.supportedSecondFactors.find((factor) => factor.strategy === 'email_code')
        const phoneFactor = signIn.supportedSecondFactors.find((factor) => factor.strategy === 'phone_code')

        if (emailFactor) {
          const { error: emailCodeError } = await signIn.mfa.sendEmailCode()
          if (emailCodeError) {
            setErrorMessage(emailCodeError.message)
            return
          }

          setVerificationStrategy('email_code')
          return
        }

        if (phoneFactor) {
          const { error: phoneCodeError } = await signIn.mfa.sendPhoneCode()
          if (phoneCodeError) {
            setErrorMessage(phoneCodeError.message)
            return
          }

          setVerificationStrategy('phone_code')
          return
        }

        setErrorMessage('Client Trust ist erforderlich, aber kein unterstützter Code-Faktor ist verfügbar.')
        return
      }

      if (signIn.createdSessionId) {
        await signIn.finalize()
        navigateToHome('/(home)')
        return
      }

      if (signIn.status !== 'complete') {
        setErrorMessage(`Sign-in unerwarteter Status: ${signIn.status ?? 'unbekannt'}`)
        return
      }

      navigateToHome('/(home)')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Sign-in fehlgeschlagen.')
    }
  }

  const handleVerify = async () => {
    setErrorMessage('')

    try {
      if (!verificationStrategy) {
        setErrorMessage('Es fehlt der Verifizierungsmodus.')
        return
      }

      if (!verificationCode.trim()) {
        setErrorMessage('Bitte den Bestätigungscode eingeben.')
        return
      }

      const verificationPayload = { code: verificationCode.trim() }

      const result =
        verificationStrategy === 'email_code'
          ? await signIn.mfa.verifyEmailCode(verificationPayload)
          : await signIn.mfa.verifyPhoneCode(verificationPayload)

      if (result.error) {
        setErrorMessage(result.error.message)
        return
      }

      if (signIn.createdSessionId) {
        await signIn.finalize()
        setVerificationCode('')
        setVerificationStrategy(null)
        navigateToHome('/(home)')
        return
      }

      if (signIn.status === 'complete') {
        setVerificationCode('')
        setVerificationStrategy(null)
        navigateToHome('/(home)')
        return
      }

      setErrorMessage(`Verifizierung unerwarteter Status: ${signIn.status ?? 'unbekannt'}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Verifizierung fehlgeschlagen.')
    }
  }

  const visibleErrors = Array.from(
    new Set([
      errors.fields.identifier?.message,
      errors.fields.password?.message,
      errorMessage,
    ].filter((message): message is string => Boolean(message))),
  )

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
              <View style={styles.card}>
                <Text style={styles.eyebrow}>Planty</Text>
                <Text style={styles.title}>Willkommen zurück</Text>
                <Text style={styles.subtitle}>Melde dich mit deiner E-Mail-Adresse und deinem Passwort an.</Text>

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
                  placeholder="Dein Passwort"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  onChangeText={setPassword}
                />

                {visibleErrors.map((message) => (
                  <Text key={message} style={styles.error}>
                    {message}
                  </Text>
                ))}

                {verificationStrategy ? (
                  <>
                    <Text style={styles.label}>Bestätigungscode</Text>
                    <TextInput
                      style={styles.input}
                      value={verificationCode}
                      placeholder="6-stelliger Code"
                      placeholderTextColor={colors.muted}
                      onChangeText={setVerificationCode}
                      keyboardType="number-pad"
                    />

                    <Pressable
                      style={({ pressed }) => [
                        styles.button,
                        (!verificationCode || fetchStatus === 'fetching') && styles.buttonDisabled,
                        pressed && styles.buttonPressed,
                      ]}
                      onPress={handleVerify}
                      disabled={!verificationCode || fetchStatus === 'fetching'}
                    >
                      <Text style={styles.buttonText}>Code prüfen</Text>
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}
                      onPress={() => {
                        setVerificationCode('')
                        setVerificationStrategy(null)
                        setErrorMessage('')
                      }}
                    >
                      <Text style={styles.linkButtonText}>Zurück zum Passwort</Text>
                    </Pressable>
                  </>
                ) : null}

                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    (!emailAddress || !password || fetchStatus === 'fetching') && styles.buttonDisabled,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={handleSubmit}
                  disabled={!emailAddress || !password || fetchStatus === 'fetching'}
                >
                  <Text style={styles.buttonText}>Sign in</Text>
                </Pressable>

                <View style={styles.linkRow}>
                  <Text style={styles.linkPrompt}>Noch kein Konto?</Text>
                  <Link href="/(auth)/sign-up">
                    <Text style={styles.link}>Sign up</Text>
                  </Link>
                </View>
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
  linkButton: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 2,
  },
  linkButtonPressed: {
    opacity: 0.8,
  },
  linkButtonText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
})
