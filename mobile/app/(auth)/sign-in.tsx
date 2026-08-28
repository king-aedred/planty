import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Screen } from '@/components/ui/screen'
import { SectionLabel } from '@/components/ui/section-label'
import { TextField } from '@/components/ui/text-field'
import { type Href, Link, useRouter } from 'expo-router'
import React from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'

function getFriendlyErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof TypeError || (error instanceof Error && /network/i.test(error.message))) {
    return 'Keine Verbindung zum Server. Prüf dein Internet und versuch es noch mal.'
  }

  return error instanceof Error && error.message ? error.message : fallback
}

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

  const isSubmitting = fetchStatus === 'fetching'

  const handleSubmit = async () => {
    if (isSubmitting) {
      return
    }

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
      setErrorMessage(getFriendlyErrorMessage(error, 'Anmeldung fehlgeschlagen. Versuch es noch mal.'))
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
      setErrorMessage(getFriendlyErrorMessage(error, 'Verifizierung fehlgeschlagen. Versuch es noch mal.'))
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
    <Screen edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            <YStack flex={1} justifyContent="center" padding="$20" gap="$16">
              <XStack justifyContent="center">
                <Logo variant="full" size={22} />
              </XStack>

              <Card>
                <SectionLabel>Anmeldung</SectionLabel>
                <Text fontFamily="$heading" color="$textPrimary" fontSize="$8" marginTop="$4">
                  Deine Pflanze wartet schon.
                </Text>
                <Text fontFamily="$body" color="$textSecondary" fontSize={15} lineHeight={21} marginBottom="$4">
                  Melde dich an — lange Funkstille mag sie nicht.
                </Text>

                <TextField
                  label="E-Mail-Adresse"
                  value={emailAddress}
                  onChangeText={setEmailAddress}
                  placeholder="name@beispiel.de"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  keyboardType="email-address"
                  editable={!isSubmitting}
                />

                <TextField
                  label="Passwort"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Dein Passwort"
                  secureTextEntry
                  autoComplete="current-password"
                  textContentType="password"
                  editable={!isSubmitting}
                />

                {visibleErrors.length > 0 ? (
                  <YStack gap="$4">
                    {visibleErrors.map((message) => (
                      <Text key={message} fontFamily="$body" fontSize={12} color="$critical">
                        {message}
                      </Text>
                    ))}
                  </YStack>
                ) : null}

                {verificationStrategy ? (
                  <>
                    <TextField
                      label="Bestätigungscode"
                      value={verificationCode}
                      onChangeText={setVerificationCode}
                      placeholder="6-stelliger Code"
                      keyboardType="number-pad"
                      autoComplete="one-time-code"
                      textContentType="oneTimeCode"
                      editable={!isSubmitting}
                    />

                    <Button onPress={handleVerify} disabled={!verificationCode} loading={isSubmitting}>
                      Code prüfen
                    </Button>

                    <Button
                      variant="ghost"
                      onPress={() => {
                        setVerificationCode('')
                        setVerificationStrategy(null)
                        setErrorMessage('')
                      }}
                    >
                      Zurück zum Passwort
                    </Button>
                  </>
                ) : (
                  <Button onPress={handleSubmit} disabled={!emailAddress || !password} loading={isSubmitting}>
                    Anmelden
                  </Button>
                )}

                <XStack alignItems="center" gap="$4">
                  <Text fontFamily="$body" fontSize={14} color="$textSecondary">
                    Noch kein Konto?
                  </Text>
                  <Link href="/(auth)/sign-up">
                    <Text fontFamily="$body" fontSize={14} fontWeight="700" color="$accent">
                      Registrieren
                    </Text>
                  </Link>
                </XStack>
              </Card>
            </YStack>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Screen>
  )
}
