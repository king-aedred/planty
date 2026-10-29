import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FadeIn } from '@/components/ui/fade-in'
import { TextField } from '@/components/ui/text-field'
import { Ionicons } from '@expo/vector-icons'
import { type ReactNode, useEffect, useState } from 'react'
import { ActivityIndicator } from 'react-native'
import { Text, useTheme, XStack } from 'tamagui'
import type { ChannelAdapter } from './channel-setup'
import { Heading, IconStage } from './sensor-steps'

// Einrichtung der Kanäle im Onboarding (P3 → Push, Telegram, Anruf). Jede Karte meldet über onDone, dass es
// weitergehen kann; „Später“ überspringt den Kanal.

type StepProps = {
  plantName: string
  channels: ChannelAdapter
  onDone: () => void
  back: ReactNode
  ignoreReducedMotion?: boolean
}

function SkipLink({ onPress, label = 'Später' }: { onPress: () => void; label?: string }) {
  return (
    <Text fontFamily="$body" fontSize={14} color="$textSecondary" onPress={onPress} role="button">
      {label}
    </Text>
  )
}

function DoneRow({ label }: { label: string }) {
  const theme = useTheme()
  return (
    <FadeIn duration={250} offset={4}>
      <XStack alignSelf="center" alignItems="center" gap="$8" paddingVertical="$8" paddingHorizontal="$12" borderRadius="$999" backgroundColor="$successSoft">
        <Ionicons name="checkmark-circle" size={18} color={theme.success?.val} />
        <Text fontFamily="$body" fontWeight="600" fontSize={14} color="$textPrimary">
          {label}
        </Text>
      </XStack>
    </FadeIn>
  )
}

// Push: System-Erlaubnis einholen.
export function PushSetupCard({ plantName, channels, onDone, back }: StepProps) {
  const theme = useTheme()
  const [state, setState] = useState<'idle' | 'asking' | 'granted' | 'denied'>('idle')

  useEffect(() => {
    if (state !== 'granted') {
      return
    }
    const timer = setTimeout(onDone, 900)
    return () => clearTimeout(timer)
  }, [onDone, state])

  const ask = async () => {
    setState('asking')
    setState(await channels.requestPush())
  }

  return (
    <Card>
      <Heading label="Push" title={`Darf ${plantName} dir Mitteilungen schicken?`} text="Gleich fragt dein Handy nach der Erlaubnis." />
      <IconStage>
        <Ionicons name="notifications" size={36} color={theme.accentText?.val} />
      </IconStage>
      {state === 'granted' ? (
        <DoneRow label="Mitteilungen erlaubt" />
      ) : state === 'denied' ? (
        <>
          <Text fontFamily="$body" fontSize={14} lineHeight="$4" color="$textSecondary" textAlign="center">
            Kein Problem. Du kannst es später in den Einstellungen deines Handys erlauben.
          </Text>
          <Button onPress={onDone}>Weiter</Button>
        </>
      ) : (
        <>
          <Button onPress={() => void ask()} loading={state === 'asking'}>
            Erlauben
          </Button>
          <XStack justifyContent="space-between">
            {back}
            <SkipLink onPress={onDone} />
          </XStack>
        </>
      )}
    </Card>
  )
}

// Telegram: Bot öffnen, auf Verbindung warten.
export function TelegramSetupCard({ plantName, channels, onDone, back }: StepProps) {
  const theme = useTheme()
  const [code, setCode] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'waiting' | 'connected'>('idle')

  useEffect(() => {
    let cancelled = false
    void channels.createTelegramCode().then((value) => {
      if (!cancelled) {
        setCode(value)
      }
    })
    return () => {
      cancelled = true
    }
  }, [channels])

  useEffect(() => {
    if (state !== 'waiting') {
      return
    }
    return channels.watchTelegram(() => setState('connected'))
  }, [channels, state])

  useEffect(() => {
    if (state !== 'connected') {
      return
    }
    const timer = setTimeout(onDone, 900)
    return () => clearTimeout(timer)
  }, [onDone, state])

  const open = async () => {
    if (!code) {
      return
    }
    await channels.openTelegram(code)
    setState('waiting')
  }

  return (
    <Card>
      <Heading label="Telegram" title="Telegram verbinden" text={`Dann schreibt dir ${plantName} auch im Telegram-Chat.`} />
      <IconStage pulsing={state === 'waiting'}>
        <Ionicons name="paper-plane" size={34} color={theme.accentText?.val} />
      </IconStage>
      {state === 'connected' ? (
        <DoneRow label="Telegram verbunden" />
      ) : state === 'waiting' ? (
        <>
          <XStack alignItems="center" justifyContent="center" gap="$8">
            <ActivityIndicator size="small" color={theme.accentText?.val} />
            <Text fontFamily="$body" fontSize={14} color="$textSecondary">
              Tipp im Chat auf „Start“ …
            </Text>
          </XStack>
          <Button variant="secondary" onPress={() => void open()}>
            Telegram nochmal öffnen
          </Button>
          <XStack justifyContent="space-between">
            {back}
            <SkipLink onPress={onDone} />
          </XStack>
        </>
      ) : (
        <>
          <Button onPress={() => void open()} disabled={!code}>
            Telegram öffnen
          </Button>
          {code ? (
            <Text fontFamily="$body" fontSize={12} color="$textSecondary" textAlign="center">
              Klappt nicht? Schick dem Callgreen-Bot: /start {code}
            </Text>
          ) : null}
          <XStack justifyContent="space-between">
            {back}
            <SkipLink onPress={onDone} />
          </XStack>
        </>
      )}
    </Card>
  )
}

// Anruf: Nummer eingeben, Testanruf (falls verfügbar), bestätigen.
export function CallSetupCard({ plantName, channels, onDone, back, ignoreReducedMotion }: StepProps) {
  const theme = useTheme()
  const [phone, setPhone] = useState('')
  const [state, setState] = useState<'idle' | 'calling' | 'asked' | 'saved'>('idle')
  const canTest = Boolean(channels.startTestCall)
  const isValid = phone.replace(/[^\d]/g, '').length >= 8

  const startCall = async () => {
    await channels.savePhone(phone.trim())
    if (!channels.startTestCall) {
      setState('saved')
      return
    }
    setState('calling')
    await channels.startTestCall(phone.trim())
    setState('asked')
  }

  return (
    <Card>
      <Heading label="Anruf" title={`Unter welcher Nummer erreicht ${plantName} dich?`} />
      <IconStage pulsing={state === 'calling'} ignoreReducedMotion={ignoreReducedMotion}>
        <Ionicons name="call" size={34} color={theme.accentText?.val} />
      </IconStage>

      {state === 'calling' ? (
        <Text fontFamily="$body" fontSize={15} color="$textPrimary" textAlign="center">
          {plantName} ruft dich gerade an …
        </Text>
      ) : state === 'asked' ? (
        <>
          <Text fontFamily="$body" fontSize={15} color="$textPrimary" textAlign="center">
            Hat dein Handy geklingelt?
          </Text>
          <Button onPress={onDone}>Ja, hat geklappt</Button>
          <Button variant="ghost" onPress={() => setState('idle')}>
            Nein, Nummer prüfen
          </Button>
        </>
      ) : state === 'saved' ? (
        <>
          <DoneRow label="Nummer gespeichert" />
          <Text fontFamily="$body" fontSize={13} color="$textSecondary" textAlign="center">
            Anrufe starten bald. Dann klingelt es bei dir.
          </Text>
          <Button onPress={onDone}>Weiter</Button>
        </>
      ) : (
        <>
          <TextField label="Handynummer" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />
          <Button onPress={() => void startCall()} disabled={!isValid}>
            {canTest ? 'Testanruf starten' : 'Nummer speichern'}
          </Button>
          <XStack justifyContent="space-between">
            {back}
            <SkipLink onPress={onDone} />
          </XStack>
        </>
      )}
    </Card>
  )
}

