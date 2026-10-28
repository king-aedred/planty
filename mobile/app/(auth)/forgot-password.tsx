import { AuthShell, type AuthShellHelpers } from '@/components/auth/auth-shell'
import { MOCK_CODE, MOCK_EMAIL, MOCK_HOME, mockDelay } from '@/components/auth/preview-mock'
import { VerificationCard } from '@/components/auth/verification-card'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SectionLabel } from '@/components/ui/section-label'
import { TextField } from '@/components/ui/text-field'
import { useLocalSearchParams } from 'expo-router'
import React from 'react'
import { Text, XStack } from 'tamagui'

type Step = 'email' | 'code' | 'password' | 'done'

function getFriendlyErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof TypeError || (error instanceof Error && /network/i.test(error.message))) {
    return 'Keine Verbindung zum Server. Prüf dein Internet und versuch es noch mal.'
  }
  return error instanceof Error && error.message ? error.message : fallback
}

export default function Page() {
  return <ForgotPasswordContent />
}

// Passwort vergessen: E-Mail → Code → neues Passwort → fertig (angemeldet). Jeder Schritt tauscht nur die Box.
// preview: für /preview, läuft simuliert mit den Testdaten aus preview-mock.ts, ohne Clerk.
export function ForgotPasswordContent({ preview = false }: { preview?: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useSignIn } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { signIn, fetchStatus } = useSignIn()
  const params = useLocalSearchParams<{ email?: string }>()
  const shell = React.useRef<AuthShellHelpers | null>(null)

  const [step, setStep] = React.useState<Step>('email')
  const [emailAddress, setEmailAddress] = React.useState(params.email ?? '')
  const [code, setCode] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [passwordConfirmation, setPasswordConfirmation] = React.useState('')
  const [errorMessage, setErrorMessage] = React.useState('')
  const [codeErrorKey, setCodeErrorKey] = React.useState(0)
  const [isMockBusy, setIsMockBusy] = React.useState(false)
  const [isResending, setIsResending] = React.useState(false)

  if (!signIn) {
    return null
  }

  const isBusy = preview ? isMockBusy : fetchStatus === 'fetching'
  const signInPath = preview ? '/preview/1-login' : '/(auth)/sign-in'
  const homePath = preview ? MOCK_HOME : '/(home)'
  const passwordMismatch = passwordConfirmation.length > 0 && password !== passwordConfirmation

  const goToStep = (next: Step) => {
    const change = () => {
      setErrorMessage('')
      setStep(next)
    }
    if (shell.current) {
      shell.current.swap(change)
    } else {
      change()
    }
  }

  // Im Testmodus ein kurzer künstlicher Serveraufruf.
  const runMock = async (check: () => string | null, onSuccess: () => void) => {
    setErrorMessage('')
    setIsMockBusy(true)
    await mockDelay()
    setIsMockBusy(false)
    const error = check()
    if (error) {
      setErrorMessage(error)
      return false
    }
    onSuccess()
    return true
  }

  const handleSendCode = async () => {
    if (isBusy) {
      return
    }
    if (preview) {
      await runMock(
        () => (emailAddress.trim().toLowerCase() === MOCK_EMAIL ? null : 'Zu dieser E-Mail-Adresse gibt es kein Konto.'),
        () => goToStep('code'),
      )
      return
    }
    setErrorMessage('')
    try {
      const { error: createError } = await signIn.create({ identifier: emailAddress.trim() })
      if (createError) {
        setErrorMessage(createError.message)
        return
      }
      const { error } = await signIn.resetPasswordEmailCode.sendCode()
      if (error) {
        setErrorMessage(error.message)
        return
      }
      goToStep('code')
    } catch (error) {
      setErrorMessage(getFriendlyErrorMessage(error, 'Code konnte nicht gesendet werden. Versuch es noch mal.'))
    }
  }

  const rejectCode = (message: string) => {
    setErrorMessage(message)
    setCode('')
    setCodeErrorKey((current) => current + 1)
  }

  const handleVerifyCode = async (submitted: string) => {
    if (preview) {
      setErrorMessage('')
      setIsMockBusy(true)
      await mockDelay()
      setIsMockBusy(false)
      if (submitted !== MOCK_CODE) {
        rejectCode('Der Code stimmt nicht. Versuch es noch mal.')
        return
      }
      goToStep('password')
      return
    }
    setErrorMessage('')
    try {
      const { error } = await signIn.resetPasswordEmailCode.verifyCode({ code: submitted.trim() })
      if (error) {
        rejectCode(error.message)
        return
      }
      goToStep('password')
    } catch (error) {
      rejectCode(getFriendlyErrorMessage(error, 'Code konnte nicht geprüft werden. Versuch es noch mal.'))
    }
  }

  const handleResend = async () => {
    setErrorMessage('')
    setIsResending(true)
    try {
      if (preview) {
        await mockDelay()
      } else {
        const { error } = await signIn.resetPasswordEmailCode.sendCode()
        if (error) {
          setErrorMessage(error.message)
        }
      }
      setCode('')
    } catch (error) {
      setErrorMessage(getFriendlyErrorMessage(error, 'Code konnte nicht erneut gesendet werden.'))
    } finally {
      setIsResending(false)
    }
  }

  const handleSavePassword = async () => {
    if (isBusy) {
      return
    }
    if (password !== passwordConfirmation) {
      setErrorMessage('Passwörter stimmen nicht überein.')
      return
    }
    if (preview) {
      await runMock(
        () => (password.length < 8 ? 'Dein Passwort braucht mindestens 8 Zeichen.' : null),
        () => goToStep('done'),
      )
      return
    }
    setErrorMessage('')
    try {
      const { error } = await signIn.resetPasswordEmailCode.submitPassword({ password })
      if (error) {
        setErrorMessage(error.message)
        return
      }
      if (signIn.status === 'complete' || signIn.createdSessionId) {
        await signIn.finalize()
      }
      goToStep('done')
    } catch (error) {
      setErrorMessage(getFriendlyErrorMessage(error, 'Passwort konnte nicht gespeichert werden. Versuch es noch mal.'))
    }
  }

  const errorText = errorMessage ? (
    <Text fontFamily="$body" fontSize={12} color="$critical">
      {errorMessage}
    </Text>
  ) : null

  return (
    <AuthShell preview={preview}>
      {(helpers) => {
        shell.current = helpers

        if (step === 'code') {
          return (
            <VerificationCard
              destination={emailAddress.trim()}
              code={code}
              onChangeCode={setCode}
              onSubmit={(submitted) => void handleVerifyCode(submitted)}
              onResend={() => void handleResend()}
              onBack={() => goToStep('email')}
              error={errorMessage}
              errorKey={codeErrorKey}
              isChecking={isBusy}
              isResending={isResending}
            />
          )
        }

        if (step === 'password') {
          return (
            <Card>
              <SectionLabel>Neues Passwort</SectionLabel>
              <Text fontFamily="$heading" color="$textPrimary" fontSize="$8" marginTop="$4" marginBottom="$4">
                Fast geschafft!
              </Text>
              <TextField
                label="Neues Passwort"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                editable={!isBusy}
              />
              <TextField
                label="Passwort bestätigen"
                value={passwordConfirmation}
                onChangeText={setPasswordConfirmation}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                editable={!isBusy}
                error={passwordMismatch ? 'Stimmt noch nicht mit dem Passwort überein.' : undefined}
              />
              {errorText}
              <Button onPress={() => void handleSavePassword()} disabled={!password || !passwordConfirmation} loading={isBusy}>
                Passwort speichern
              </Button>
            </Card>
          )
        }

        if (step === 'done') {
          return (
            <Card>
              <SectionLabel>Erledigt</SectionLabel>
              <Text fontFamily="$heading" color="$textPrimary" fontSize="$8" marginTop="$4">
                Passwort geändert!
              </Text>
              <Text fontFamily="$body" color="$textSecondary" fontSize={15} lineHeight="$5" marginBottom="$4">
                Du bist jetzt angemeldet.
              </Text>
              <Button onPress={() => helpers.finish(homePath)}>Weiter</Button>
            </Card>
          )
        }

        return (
          <Card>
            <SectionLabel>Passwort vergessen</SectionLabel>
            <Text fontFamily="$heading" color="$textPrimary" fontSize="$8" marginTop="$4" marginBottom="$4">
              Kein Problem!
            </Text>
            <TextField
              label="E-Mail-Adresse"
              value={emailAddress}
              onChangeText={setEmailAddress}
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              editable={!isBusy}
            />
            {errorText}
            <Button onPress={() => void handleSendCode()} disabled={!emailAddress.trim()} loading={isBusy}>
              Code senden
            </Button>
            <XStack>
              <Text fontFamily="$body" fontSize={14} color="$textSecondary" onPress={() => helpers.leaveTo(signInPath)} role="button">
                Zurück zum Login
              </Text>
            </XStack>
          </Card>
        )
      }}
    </AuthShell>
  )
}

