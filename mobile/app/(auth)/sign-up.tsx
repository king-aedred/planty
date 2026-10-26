import { AuthShell, type AuthShellHelpers } from '@/components/auth/auth-shell'
import { MOCK_CODE, MOCK_HOME, MOCK_TAKEN_EMAIL, mockDelay } from '@/components/auth/preview-mock'
import { VerificationCard } from '@/components/auth/verification-card'
import { TermsSheet } from '@/components/legal/terms-sheet'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SectionLabel } from '@/components/ui/section-label'
import { TextField } from '@/components/ui/text-field'
import { Ionicons } from '@expo/vector-icons'
import { Redirect, type Href, useRouter } from 'expo-router'
import React from 'react'
import { Pressable } from 'react-native'
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

// preview: für /preview. Keine Weiterleitung und keine Anfragen an Clerk: Registrieren läuft simuliert
// (preview-mock.ts), es wird kein Konto angelegt und keine Mail verschickt.
export function SignUpContent({ preview = false }: { preview?: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuth, useSignUp } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { signUp, fetchStatus } = useSignUp()
  const { isSignedIn } = useAuth()
  const router = useRouter()
  const theme = useTheme()
  // Übergänge (Box aus- und einblenden) aus dem gemeinsamen Auth-Rahmen.
  const shell = React.useRef<AuthShellHelpers | null>(null)
  const [isTermsOpen, setIsTermsOpen] = React.useState(false)
  const [codeErrorKey, setCodeErrorKey] = React.useState(0)
  const [isMockBusy, setIsMockBusy] = React.useState(false)

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

  const showVerification = (show: boolean) => {
    const change = () => {
      setCode('')
      setVerificationError('')
      setVerificationRequested(show)
    }
    if (shell.current) {
      shell.current.swap(change)
    } else {
      change()
    }
  }

  const isVerificationStep = verificationRequested
  const isSubmitting = preview ? isMockBusy : fetchStatus === 'fetching'

  const navigateToHome = (url: string) => {
    if (url.startsWith('http')) {
      if (typeof window !== 'undefined') {
        window.location.href = url
      }
      return
    }

    if (shell.current) {
      shell.current.finish(url)
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

    if (preview) {
      setIsMockBusy(true)
      await mockDelay()
      setIsMockBusy(false)
      if (emailAddress.trim().toLowerCase() === MOCK_TAKEN_EMAIL) {
        setEmailAlreadyRegistered(true)
        setRegistrationError('Diese E-Mail-Adresse ist schon registriert.')
        return
      }
      if (password.length < 8) {
        setRegistrationError('Dein Passwort braucht mindestens 8 Zeichen.')
        return
      }
      showVerification(true)
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

      showVerification(true)
    } catch (error) {
      setRegistrationError(getFriendlyErrorMessage(error, 'Registrierung fehlgeschlagen. Versuch es noch mal.'))
    }
  }

  const handleVerify = async (submittedCode?: string) => {
    setVerificationError('')

    if (preview) {
      setIsMockBusy(true)
      await mockDelay()
      setIsMockBusy(false)
      if ((submittedCode ?? code).trim() !== MOCK_CODE) {
        setVerificationError('Der Code stimmt nicht. Versuch es noch mal.')
        setCode('')
        setCodeErrorKey((current) => current + 1)
        return
      }
      shell.current?.finish(MOCK_HOME)
      return
    }

    try {
      const { error } = await signUp.verifications.verifyEmailCode({
        code: (submittedCode ?? code).trim(),
      })

      if (error) {
        setVerificationError(`Code konnte nicht bestätigt werden: ${error.message}`)
        setCode('')
        setCodeErrorKey((current) => current + 1)
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

    if (preview) {
      await mockDelay()
      setCode('')
      setIsResendingCode(false)
      return
    }

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

  if (signUp.status === 'complete' || (!preview && isSignedIn)) {
    return <Redirect href="/(home)" />
  }

  const passwordMismatch = passwordConfirmation.length > 0 && password !== passwordConfirmation
  const signInPath = preview ? '/preview/1-login' : '/(auth)/sign-in'

  return (
    <>
      <AuthShell preview={preview}>
        {(helpers) => {
          shell.current = helpers

          if (isVerificationStep) {
            return (
              <VerificationCard
                destination={emailAddress}
                code={code}
                onChangeCode={setCode}
                onSubmit={(submitted) => void handleVerify(submitted)}
                onResend={() => void handleResendCode()}
                onBack={() => showVerification(false)}
                error={verificationError}
                errorKey={codeErrorKey}
                isChecking={isSubmitting}
                isResending={isResendingCode}
              />
            )
          }

          return (
            <Card>
              <SectionLabel>Registrierung</SectionLabel>
              <Text fontFamily="$heading" color="$textPrimary" fontSize="$8" marginTop="$4" marginBottom="$4">
                Gib deiner Pflanze eine Stimme!
              </Text>


              <TextField
                label="Benutzername"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoComplete="username"
                textContentType="username"
                editable={!isSubmitting}
              />

              <TextField
                label="E-Mail-Adresse"
                value={emailAddress}
                onChangeText={setEmailAddress}
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
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                editable={!isSubmitting}
              />

              <TextField
                label="Passwort bestätigen"
                value={passwordConfirmation}
                onChangeText={setPasswordConfirmation}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                editable={!isSubmitting}
                error={passwordMismatch ? 'Stimmt noch nicht mit dem Passwort überein.' : undefined}
              />

              <XStack alignItems="center" gap="$8" paddingVertical="$4">
                <Pressable
                  onPress={() => setLegalAccepted((current) => !current)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: legalAccepted }}
                  hitSlop={8}
                >
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
                    {legalAccepted ? <Ionicons name="checkmark" size={14} color={theme.textOnAccent?.val} /> : null}
                  </View>
                </Pressable>
                <Text fontFamily="$body" fontSize={14} color="$textPrimary" flex={1}>
                  <Text onPress={() => setLegalAccepted((current) => !current)}>Ich akzeptiere die </Text>
                  <Text fontWeight="700" color="$accentText" textDecorationLine="underline" onPress={() => setIsTermsOpen(true)} role="link">
                    Nutzungsbedingungen
                  </Text>
                  <Text>.</Text>
                </Text>
              </XStack>

              {registrationError ? (
                <YStack gap="$4">
                  <Text fontFamily="$body" fontSize={12} color="$critical">
                    {registrationError}
                  </Text>
                  {emailAlreadyRegistered ? (
                    <Text fontFamily="$body" fontSize={13} fontWeight="700" color="$accent" onPress={() => helpers.leaveTo(signInPath)} role="button">
                      Zum Login
                    </Text>
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
                <Text fontFamily="$body" fontSize={14} fontWeight="700" color="$accent" onPress={() => helpers.leaveTo(signInPath)} role="button">
                  Anmelden
                </Text>
              </XStack>

              <View nativeID="clerk-captcha" />
            </Card>
          )
        }}
      </AuthShell>

      <TermsSheet
        visible={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
        onAccept={() => {
          setLegalAccepted(true)
          setIsTermsOpen(false)
        }}
      />
    </>
  )
}
