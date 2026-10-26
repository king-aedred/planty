import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SectionLabel } from '@/components/ui/section-label'
import { Text, XStack } from 'tamagui'
import { CodeInput } from './code-input'

type VerificationCardProps = {
  // Wohin der Code ging, z. B. die E-Mail-Adresse. Ohne Angabe ein allgemeiner Satz.
  destination?: string
  code: string
  onChangeCode: (code: string) => void
  onSubmit: (code: string) => void
  onResend: () => void
  onBack: () => void
  error?: string
  errorKey?: number
  isChecking?: boolean
  isResending?: boolean
}

// Box für den 6-stelligen Code (E-Mail-Bestätigung bei der Registrierung, neues Gerät beim Login).
export function VerificationCard({
  destination,
  code,
  onChangeCode,
  onSubmit,
  onResend,
  onBack,
  error,
  errorKey,
  isChecking = false,
  isResending = false,
}: VerificationCardProps) {
  return (
    <Card>
      <SectionLabel>Bestätigung</SectionLabel>
      <Text fontFamily="$heading" color="$textPrimary" fontSize="$8" marginTop="$4">
        Code eingeben
      </Text>
      <Text fontFamily="$body" color="$textSecondary" fontSize={15} lineHeight="$5" marginBottom="$4">
        {destination ? `Wir haben dir einen 6-stelligen Code an ${destination} geschickt.` : 'Wir haben dir einen 6-stelligen Code geschickt.'}
      </Text>

      <CodeInput value={code} onChangeText={onChangeCode} onComplete={onSubmit} errorKey={errorKey} disabled={isChecking} />

      {error ? (
        <Text fontFamily="$body" fontSize={12} color="$critical">
          {error}
        </Text>
      ) : null}

      <Button onPress={() => onSubmit(code)} disabled={code.length < 6} loading={isChecking}>
        Bestätigen
      </Button>

      <XStack justifyContent="space-between" alignItems="center">
        <Text fontFamily="$body" fontSize={14} color="$textSecondary" onPress={onBack} role="button">
          Zurück
        </Text>
        <Text
          fontFamily="$body"
          fontSize={14}
          fontWeight="700"
          color={isResending ? '$textSecondary' : '$accent'}
          onPress={isResending ? undefined : onResend}
          role="button"
        >
          {isResending ? 'Wird gesendet …' : 'Code erneut senden'}
        </Text>
      </XStack>
    </Card>
  )
}
