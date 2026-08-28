import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Screen } from '@/components/ui/screen'
import { SectionLabel } from '@/components/ui/section-label'
import { TextField } from '@/components/ui/text-field'
import { Ionicons } from '@expo/vector-icons'
import { Redirect, type Href, Link, useRouter } from 'expo-router'
import React from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, TouchableWithoutFeedback } from 'react-native'
import { Text, useTheme, View, XStack, YStack } from 'tamagui'

function getFriendlyErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof TypeError || (error instanceof Error && /network/i.test(error.message))) {
    return 'Keine Verbindung zum Server. Prüf dein Internet und versuch es noch mal.'
  }

  return error instanceof Error && error.message ? error.message : fallback
}

export default function Page() {
  return <SignUpContent />
}

function SignUpContent() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuth, useSignUp } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { signUp, fetchStatus } = useSignUp()
  const { isSignedIn } = useAuth()
  const router = useRouter()
  const theme = useTheme()

  const [emailAddress, setEmailAddress] = React.useState('')
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [passwordConfirmation, setPasswordConfirmation] = React.useState('')
  const [legalAccepted, setLegalAccepted] = React.useState(false)
  const [code, setCode] = React.useState('')
  const [registrationError, setRegistrationError] = React.useState('')
  const [verificationError, setVerificationError] = React.useState('')
  const [verificationRequested, setVerificationRequested] = React.useState(false)
  const [isResendingCode, setIsResendingCode] = React.useState(false)
  const [emailAlreadyRegistered, setEmailAlreadyRegistered] = React.useState(false)

  if (!signUp) {
    return null
  }

  const isVerificationStep = verificationRequested
  const isSubmitting = fetchStatus === 'fetching'

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
    if (isSubmitting) {
      return
    }

    setRegistrationError('')
    setVerificationError('')
    setEmailAlreadyRegistered(false)

    if (password !== passwordConfirmation) {
      setRegistrationError('Passwörter stimmen nicht überein.')
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
        const clerkError = error as {
          code?: string
          errors?: { code?: string }[]
        }
        const isPwnedPassword =
          clerkError.code === 'form_password_pwned' ||
          clerkError.errors?.some((entry) => entry.code === 'form_password_pwned')

        if (isPwnedPassword) {
          setRegistrationError('Dieses Passwort wurde in einer Datenpanne gefunden. Bitte wähle ein anderes Passwort.')
          setVerificationRequested(false)
          return
        }

        const isDuplicateEmail =
          clerkError.code === 'form_identifier_exists' ||
          clerkError.errors?.some((entry) => entry.code === 'form_identifier_exists')

        if (isDuplicateEmail) {
          setEmailAlreadyRegistered(true)
          setRegistrationError(error.message)
          return
        }

        setRegistrationError(error.message)
        return
      }

      setRegistrationError('')
      setVerificationError('')

      const { error: sendCodeError } = await signUp.verifications.sendEmailCode()

      if (sendCodeError) {
        setRegistrationError(sendCodeError.message)
        return
      }

      setVerificationRequested(true)
    } catch (error) {
      setRegistrationError(getFriendlyErrorMessage(error, 'Registrierung fehlgeschlagen. Versuch es noch mal.'))
    }
  }

  const handleVerify = async () => {
    setVerificationError('')

    try {
      const { error } = await signUp.verifications.verifyEmailCode({
        code: code.trim(),
      })

      if (error) {
        setVerificationError(`Code konnte nicht bestätigt werden: ${error.message}`)
        return
      }

      const { error: finalizeError } = await signUp.finalize()

      if (finalizeError) {
        setVerificationError(`Konto konnte nicht abgeschlossen werden: ${finalizeError.message}`)
        return
      }

      setVerificationRequested(false)
      navigateToHome('/(home)')
    } catch (error) {
      setVerificationError(getFriendlyErrorMessage(error, 'Verifizierung fehlgeschlagen. Versuch es noch mal.'))
    }
  }

  const handleResendCode = async () => {
    setVerificationError('')
    setIsResendingCode(true)

    try {
      const { error } = await signUp.verifications.sendEmailCode()
      if (error) {
        setVerificationError(error.message)
        return
      }

      setCode('')
    } catch (error) {
      setVerificationError(getFriendlyErrorMessage(error, 'Code konnte nicht erneut gesendet werden.'))
    } finally {
      setIsResendingCode(false)
    }
  }

  if (signUp.status === 'complete' || isSignedIn) {
    return <Redirect href="/(home)" />
  }

  const passwordMismatch = passwordConfirmation.length > 0 && password !== passwordConfirmation

  if (isVerificationStep) {
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
                  <SectionLabel>Bestätigung</SectionLabel>
                  <Text fontFamily="$heading" color="$textPrimary" fontSize="$7" marginTop="$4">
                    E-Mail bestätigen
                  </Text>
                  <Text fontFamily="$body" color="$textSecondary" fontSize={15} lineHeight={21} marginBottom="$4">
                    Wir haben dir einen Code geschickt. Kurz reinschauen.
                  </Text>

                  <TextField
                    label="Verifizierungscode"
                    value={code}
                    onChangeText={setCode}
                    placeholder="123456"
                    keyboardType="number-pad"
                    autoCapitalize="none"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    editable={!isResendingCode}
                  />

                  {verificationError ? (
                    <Text fontFamily="$body" fontSize={12} color="$critical">
                      {verificationError}
                    </Text>
                  ) : null}

                  <Button onPress={handleVerify} disabled={!code}>
                    Code prüfen
                  </Button>

                  <Button variant="ghost" onPress={handleResendCode} disabled={isResendingCode} loading={isResendingCode}>
                    Neuen Code senden
                  </Button>
                </Card>
              </YStack>
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Screen>
    )
  }

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
                <SectionLabel>Registrierung</SectionLabel>
                <Text fontFamily="$heading" color="$textPrimary" fontSize="$8" marginTop="$4">
                  Gib deiner Pflanze eine Stimme.
                </Text>
                <Text fontFamily="$body" color="$textSecondary" fontSize={15} lineHeight={21} marginBottom="$4">
                  Konto erstellen — der Rest ist Wasser und Geduld.
                </Text>

                <TextField
                  label="Benutzername"
                  value={username}
                  onChangeText={setUsername}
                  placeholder="plantyfan"
                  autoCapitalize="none"
                  autoComplete="username"
                  textContentType="username"
                  editable={!isSubmitting}
                />

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
                  placeholder="Mindestens 8 Zeichen"
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                  editable={!isSubmitting}
                />

                <TextField
                  label="Passwort bestätigen"
                  value={passwordConfirmation}
                  onChangeText={setPasswordConfirmation}
                  placeholder="Passwort erneut eingeben"
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                  editable={!isSubmitting}
                  error={passwordMismatch ? 'Stimmt noch nicht mit dem Passwort überein.' : undefined}
                />

                <Pressable
                  onPress={() => setLegalAccepted((current) => !current)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: legalAccepted }}
                >
                  <XStack alignItems="center" gap="$8" paddingVertical="$4">
                    <View
                      width={22}
                      height={22}
                      borderRadius="$2"
                      borderWidth={1}
                      borderColor={legalAccepted ? '$accent' : '$border'}
                      backgroundColor={legalAccepted ? '$accent' : 'transparent'}
                      alignItems="center"
                      justifyContent="center"
                    >
                      {legalAccepted ? <Ionicons name="checkmark" size={14} color={theme.textOnAccent.val} /> : null}
                    </View>
                    <Text fontFamily="$body" fontSize={14} color="$textPrimary" flex={1}>
                      Ich akzeptiere die Nutzungsbedingungen.
                    </Text>
                  </XStack>
                </Pressable>

                {registrationError ? (
                  <YStack gap="$4">
                    <Text fontFamily="$body" fontSize={12} color="$critical">
                      {registrationError}
                    </Text>
                    {emailAlreadyRegistered ? (
                      <Link href="/(auth)/sign-in">
                        <Text fontFamily="$body" fontSize={13} fontWeight="700" color="$accent">
                          Zum Login
                        </Text>
                      </Link>
                    ) : null}
                  </YStack>
                ) : null}

                <Button
                  onPress={handleSubmit}
                  disabled={!emailAddress || !username || !password || !passwordConfirmation || !legalAccepted}
                  loading={isSubmitting}
                >
                  Konto erstellen
                </Button>

                <XStack alignItems="center" gap="$4">
                  <Text fontFamily="$body" fontSize={14} color="$textSecondary">
                    Schon ein Konto?
                  </Text>
                  <Link href="/(auth)/sign-in">
                    <Text fontFamily="$body" fontSize={14} fontWeight="700" color="$accent">
                      Anmelden
                    </Text>
                  </Link>
                </XStack>

                <View nativeID="clerk-captcha" />
              </Card>
            </YStack>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Screen>
  )
}
