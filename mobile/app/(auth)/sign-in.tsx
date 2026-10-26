import { AuthShell, type AuthShellHelpers } from '@/components/auth/auth-shell'
import { MOCK_CODE, MOCK_EMAIL, MOCK_HOME, MOCK_PASSWORD, mockDelay } from '@/components/auth/preview-mock'
import { VerificationCard } from '@/components/auth/verification-card'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SectionLabel } from '@/components/ui/section-label'
import { TextField } from '@/components/ui/text-field'
import { type Href, useRouter } from 'expo-router'
import React from 'react'
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

// preview: für /preview. Keine automatische Weiterleitung und keine Anfragen an Clerk: Anmelden läuft mit
// den Testdaten aus preview-mock.ts (E-Mail, Passwort, dann Code), danach geht es zum Demo-Dashboard.
export function SignInContent({ preview = false }: { preview?: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useSignIn } = require('@clerk/expo') as typeof import('@clerk/expo')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuth } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { signIn, errors, fetchStatus } = useSignIn()
  const { isLoaded, isSignedIn } = useAuth()
  const router = useRouter()
  // Übergänge (Box aus- und einblenden) aus dem gemeinsamen Auth-Rahmen.
  const shell = React.useRef<AuthShellHelpers | null>(null)

  const [emailAddress, setEmailAddress] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [verificationCode, setVerificationCode] = React.useState('')
  const [verificationStrategy, setVerificationStrategy] = React.useState<'email_code' | 'phone_code' | null>(null)
  const [errorMessage, setErrorMessage] = React.useState('')
  const [codeErrorKey, setCodeErrorKey] = React.useState(0)
  const [isResendingCode, setIsResendingCode] = React.useState(false)
  const [isMockBusy, setIsMockBusy] = React.useState(false)

  const showStep = (strategy: 'email_code' | 'phone_code' | null) => {
    const change = () => {
      setVerificationCode('')
      setErrorMessage('')
      setVerificationStrategy(strategy)
    }
    if (shell.current) {
      shell.current.swap(change)
    } else {
      change()
    }
  }

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

  React.useEffect(() => {
    if (!preview && isLoaded && isSignedIn) {
      navigateToHome('/(home)')
    }
  }, [preview, isLoaded, isSignedIn])

  if (!signIn) {
    return null
  }

  const isSubmitting = preview ? isMockBusy : fetchStatus === 'fetching'

  const handleMockSubmit = async () => {
    setErrorMessage('')
    setIsMockBusy(true)
    await mockDelay()
    setIsMockBusy(false)
    if (emailAddress.trim().toLowerCase() !== MOCK_EMAIL || password !== MOCK_PASSWORD) {
      setErrorMessage('E-Mail oder Passwort stimmt nicht.')
      return
    }
    showStep('email_code')
  }

  const handleMockVerify = async (code: string) => {
    setErrorMessage('')
    setIsMockBusy(true)
    await mockDelay()
    setIsMockBusy(false)
    if (code !== MOCK_CODE) {
      setErrorMessage('Der Code stimmt nicht. Versuch es noch mal.')
      setVerificationCode('')
      setCodeErrorKey((current) => current + 1)
      return
    }
    shell.current?.finish(MOCK_HOME)
  }

  const handleSubmit = async () => {
    if (isSubmitting) {
      return
    }
    if (preview) {
      await handleMockSubmit()
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

          showStep('email_code')
          return
        }

        if (phoneFactor) {
          const { error: phoneCodeError } = await signIn.mfa.sendPhoneCode()
          if (phoneCodeError) {
            setErrorMessage(phoneCodeError.message)
            return
          }

          showStep('phone_code')
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

  const handleVerify = async (submittedCode?: string) => {
    setErrorMessage('')
    const code = (submittedCode ?? verificationCode).trim()
    if (preview) {
      await handleMockVerify(code)
      return
    }

    try {
      if (!verificationStrategy) {
        setErrorMessage('Es fehlt der Verifizierungsmodus.')
        return
      }

      if (!code) {
        setErrorMessage('Bitte den Bestätigungscode eingeben.')
        return
      }

      const verificationPayload = { code }

      const result =
        verificationStrategy === 'email_code'
          ? await signIn.mfa.verifyEmailCode(verificationPayload)
          : await signIn.mfa.verifyPhoneCode(verificationPayload)

      if (result.error) {
        setErrorMessage(result.error.message)
        setVerificationCode('')
        setCodeErrorKey((current) => current + 1)
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

  const handleResendCode = async () => {
    setErrorMessage('')
    setIsResendingCode(true)
    if (preview) {
      await mockDelay()
      setVerificationCode('')
      setIsResendingCode(false)
      return
    }
    try {
      const { error } = verificationStrategy === 'phone_code' ? await signIn.mfa.sendPhoneCode() : await signIn.mfa.sendEmailCode()
      if (error) {
        setErrorMessage(error.message)
      }
      setVerificationCode('')
    } catch (error) {
      setErrorMessage(getFriendlyErrorMessage(error, 'Code konnte nicht erneut gesendet werden.'))
    } finally {
      setIsResendingCode(false)
    }
  }

  const visibleErrors = Array.from(
    new Set([
      errors.fields.identifier?.message,
      errors.fields.password?.message,
      errorMessage,
    ].filter((message): message is string => Boolean(message))),
  )

  const signUpPath = preview ? '/preview/2-register' : '/(auth)/sign-up'

  return (
    <AuthShell preview={preview}>
      {(helpers) => {
        shell.current = helpers

        if (verificationStrategy) {
          return (
            <VerificationCard
              destination={verificationStrategy === 'email_code' ? emailAddress : undefined}
              code={verificationCode}
              onChangeCode={setVerificationCode}
              onSubmit={(code) => void handleVerify(code)}
              onResend={() => void handleResendCode()}
              onBack={() => showStep(null)}
              error={errorMessage}
              errorKey={codeErrorKey}
              isChecking={isSubmitting}
              isResending={isResendingCode}
            />
          )
        }

        return (
          <Card>
            <SectionLabel>Anmeldung</SectionLabel>
            <Text fontFamily="$heading" color="$textPrimary" fontSize="$8" marginTop="$4" marginBottom="$4">
              Deine Pflanze wartet schon!
            </Text>


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

            <Button onPress={handleSubmit} disabled={!emailAddress || !password} loading={isSubmitting}>
              Anmelden
            </Button>

            <XStack alignItems="center" gap="$4">
              <Text fontFamily="$body" fontSize={14} color="$textSecondary">
                Noch kein Konto?
              </Text>
              <Text fontFamily="$body" fontSize={14} fontWeight="700" color="$accent" onPress={() => helpers.leaveTo(signUpPath)} role="button">
                Registrieren
              </Text>
            </XStack>
          </Card>
        )
      }}
    </AuthShell>
  )
}
