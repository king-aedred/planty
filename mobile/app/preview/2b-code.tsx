import { AuthShell } from '@/components/auth/auth-shell'
import { VerificationCard } from '@/components/auth/verification-card'
import { Card } from '@/components/ui/card'
import { SectionLabel } from '@/components/ui/section-label'
import { useState } from 'react'
import { Text } from 'tamagui'

const DEMO_CODE = '123456'

// Vorschau Screen 2b (docs/SCREENS.md): Code-Eingabe ohne echte Mail. 123456 gilt als richtig, alles andere wackelt.
export default function CodePreview() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [errorKey, setErrorKey] = useState(0)
  const [isChecking, setIsChecking] = useState(false)
  const [isDone, setIsDone] = useState(false)

  return (
    <AuthShell preview>
      {({ swap }) => {
        if (isDone) {
          return (
            <Card>
              <SectionLabel>Bestätigung</SectionLabel>
              <Text fontFamily="$heading" color="$textPrimary" fontSize="$8">
                Bestätigt!
              </Text>
              <Text fontFamily="$body" color="$accentText" fontSize={14} onPress={() => swap(() => setIsDone(false))} role="button">
                Nochmal ansehen
              </Text>
            </Card>
          )
        }

        return (
          <VerificationCard
            destination="name@beispiel.de"
            code={code}
            onChangeCode={setCode}
            onSubmit={(submitted) => {
              setIsChecking(true)
              setTimeout(() => {
                setIsChecking(false)
                if (submitted === DEMO_CODE) {
                  setError('')
                  setCode('')
                  swap(() => setIsDone(true))
                } else {
                  setError('Der Code stimmt nicht. Versuch es noch mal.')
                  setCode('')
                  setErrorKey((current) => current + 1)
                }
              }, 600)
            }}
            onResend={() => setError('')}
            onBack={() => setError('')}
            error={error}
            errorKey={errorKey}
            isChecking={isChecking}
          />
        )
      }}
    </AuthShell>
  )
}
