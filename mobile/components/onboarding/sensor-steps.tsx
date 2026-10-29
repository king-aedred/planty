import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FadeIn } from '@/components/ui/fade-in'
import { SectionLabel } from '@/components/ui/section-label'
import { TextField } from '@/components/ui/text-field'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { type ReactNode, useEffect, useState } from 'react'
import { ActivityIndicator } from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { Text, useTheme, XStack, YStack } from 'tamagui'
import { type ConnectStage, signalBars, type WifiNetwork } from './sensor-pairing'

// Bausteine der Sensor-Kopplung (A1–A5 aus docs/SCREENS.md). Reine Darstellung; Ablauf und Technik
// stecken in onboarding-flow.tsx bzw. sensor-pairing.ts.

export function Heading({ label, title, text }: { label: string; title: string; text?: string }) {
  return (
    <>
      <SectionLabel>{label}</SectionLabel>
      <Text fontFamily="$heading" color="$textPrimary" fontSize="$8" marginTop="$4" marginBottom={text ? 0 : '$4'}>
        {title}
      </Text>
      {text ? (
        <Text fontFamily="$body" color="$textSecondary" fontSize={15} lineHeight="$5" marginBottom="$4">
          {text}
        </Text>
      ) : null}
    </>
  )
}

// Runde Fläche mit Symbol in der Mitte, optional mit pulsierenden Ringen (Suche läuft).
export function IconStage({ children, pulsing = false, ignoreReducedMotion = false }: { children: ReactNode; pulsing?: boolean; ignoreReducedMotion?: boolean }) {
  return (
    <YStack height={150} alignItems="center" justifyContent="center">
      {pulsing ? [0, 1, 2].map((index) => <PulseRing key={index} delay={index * 600} ignoreReducedMotion={ignoreReducedMotion} />) : null}
      <YStack width={84} height={84} borderRadius="$999" backgroundColor="$accentSoft" borderWidth={1} borderColor="$accent" alignItems="center" justifyContent="center">
        {children}
      </YStack>
    </YStack>
  )
}

function PulseRing({ delay, ignoreReducedMotion }: { delay: number; ignoreReducedMotion: boolean }) {
  const progress = useSharedValue(0)
  useEffect(() => {
    const reduceMotion = ignoreReducedMotion ? ReduceMotion.Never : ReduceMotion.System
    progress.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.cubic), reduceMotion }), -1, false, undefined, reduceMotion),
      reduceMotion,
    )
  }, [delay, ignoreReducedMotion, progress])
  const style = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - progress.value),
    transform: [{ scale: 1 + progress.value * 0.8 }],
  }))
  return (
    <Animated.View style={[{ position: 'absolute', width: 84, height: 84 }, style]}>
      <YStack flex={1} borderRadius="$999" borderWidth={2} borderColor="$accent" />
    </Animated.View>
  )
}

// A1: Sensor per USB einstecken.
export function PlugInCard({ onNext, back }: { onNext: () => void; back: ReactNode }) {
  const theme = useTheme()
  return (
    <Card>
      <Heading label="Sensor koppeln" title="Steck deinen Sensor ein" text="Verbinde ihn per USB-Kabel mit Strom. Dann ist er für ein paar Minuten bereit zum Koppeln." />
      <IconStage>
        <MaterialCommunityIcons name="usb" size={38} color={theme.accentText?.val} />
      </IconStage>
      <Button onPress={onNext}>Er ist eingesteckt</Button>
      <XStack>{back}</XStack>
    </Card>
  )
}

// A2: Suche läuft / gefunden / nicht gefunden.
export function ScanCard({
  state,
  deviceName,
  onRetry,
  onNext,
  back,
  ignoreReducedMotion,
}: {
  state: 'searching' | 'found' | 'missing'
  deviceName?: string
  onRetry: () => void
  onNext: () => void
  back: ReactNode
  ignoreReducedMotion?: boolean
}) {
  const theme = useTheme()

  if (state === 'missing') {
    return (
      <Card>
        <Heading label="Sensor koppeln" title="Kein Sensor gefunden" />
        <YStack gap="$8">
          {[
            'Steckt das USB-Kabel richtig und hat Strom?',
            'Ist Bluetooth an deinem Handy eingeschaltet?',
            'Ist der Sensor schon eingerichtet und im WLAN? Dann taucht er hier nicht auf.',
          ].map((tip) => (
            <XStack key={tip} gap="$8" alignItems="flex-start">
              <Ionicons name="ellipse" size={6} color={theme.textSecondary?.val} style={{ marginTop: 8 }} />
              <Text flex={1} fontFamily="$body" fontSize={14} lineHeight="$4" color="$textSecondary">
                {tip}
              </Text>
            </XStack>
          ))}
        </YStack>
        <Button onPress={onRetry}>Nochmal suchen</Button>
        <XStack>{back}</XStack>
      </Card>
    )
  }

  const isFound = state === 'found'
  return (
    <Card>
      <Heading label="Sensor koppeln" title={isFound ? 'Sensor gefunden!' : 'Wir suchen deinen Sensor …'} />
      <IconStage pulsing={!isFound} ignoreReducedMotion={ignoreReducedMotion}>
        <Ionicons name={isFound ? 'checkmark' : 'bluetooth'} size={36} color={theme.accentText?.val} />
      </IconStage>
      {isFound ? (
        <FadeIn duration={300} offset={6} ignoreReducedMotion={ignoreReducedMotion}>
          <YStack gap="$12">
            <XStack alignSelf="center" alignItems="center" gap="$8" paddingVertical="$8" paddingHorizontal="$12" borderRadius="$999" backgroundColor="$surfaceElevated">
              <YStack width={8} height={8} borderRadius="$999" backgroundColor="$success" />
              <Text fontFamily="$body" fontWeight="600" fontSize={14} color="$textPrimary">
                {deviceName}
              </Text>
            </XStack>
            <Button onPress={onNext}>Weiter</Button>
          </YStack>
        </FadeIn>
      ) : (
        <Text fontFamily="$body" fontSize={13} color="$textSecondary" textAlign="center">
          Halte dein Handy in die Nähe des Sensors.
        </Text>
      )}
      <XStack>{back}</XStack>
    </Card>
  )
}

function SignalIcon({ rssi, color }: { rssi: number; color?: string }) {
  const bars = signalBars(rssi)
  const name = (['wifi-strength-1', 'wifi-strength-2', 'wifi-strength-3', 'wifi-strength-4'] as const)[bars - 1]
  return <MaterialCommunityIcons name={name} size={20} color={color} />
}

// Auswahlfeld fürs WLAN: zeigt das gewählte Netz; die Liste schwebt beim Öffnen über dem Inhalt darunter.
function WifiSelect({
  networks,
  selectedSsid,
  onSelect,
}: {
  networks: WifiNetwork[] | null
  selectedSsid: string | null
  onSelect: (ssid: string) => void
}) {
  const theme = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const selected = networks?.find((network) => network.ssid === selectedSsid) ?? null
  const isLoading = networks === null

  return (
    <YStack gap="$4" position="relative" zIndex={20}>
      <Text fontFamily="$body" fontSize={13} fontWeight="600" color="$textPrimary">
        WLAN
      </Text>
      <XStack
        role="button"
        aria-expanded={isOpen}
        onPress={isLoading ? undefined : () => setIsOpen((current) => !current)}
        alignItems="center"
        gap="$12"
        minHeight={50}
        paddingHorizontal="$12"
        borderWidth={1}
        borderRadius="$12"
        borderBottomLeftRadius={isOpen ? 0 : '$12'}
        borderBottomRightRadius={isOpen ? 0 : '$12'}
        borderColor={isOpen ? '$accent' : '$border'}
        backgroundColor="$background"
      >
        {isLoading ? (
          <>
            <ActivityIndicator size="small" color={theme.accentText?.val} />
            <Text flex={1} fontFamily="$body" fontSize={15} color="$textSecondary">
              Sensor sucht WLANs …
            </Text>
          </>
        ) : selected ? (
          <>
            <SignalIcon rssi={selected.rssi} color={theme.accentText?.val} />
            <Text flex={1} fontFamily="$body" fontSize={16} color="$textPrimary" numberOfLines={1}>
              {selected.ssid}
            </Text>
            {selected.secure ? <Ionicons name="lock-closed" size={14} color={theme.textSecondary?.val} /> : null}
          </>
        ) : (
          <Text flex={1} fontFamily="$body" fontSize={15} color="$textSecondary">
            Kein WLAN gefunden
          </Text>
        )}
        {!isLoading ? <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textSecondary?.val} /> : null}
      </XStack>

      {isOpen && networks ? (
        <YStack position="absolute" top="100%" left={0} right={0} zIndex={20}>
          <FadeIn duration={200} offset={4}>
            <YStack
              borderWidth={1}
              borderTopWidth={0}
              borderColor="$accent"
              borderBottomLeftRadius="$12"
              borderBottomRightRadius="$12"
              backgroundColor="$background"
              overflow="hidden"
              boxShadow="0 12px 24px rgba(0,0,0,0.45)"
            >
              {networks.map((network) => {
                const isActive = network.ssid === selectedSsid
                return (
                  <XStack
                    key={network.ssid}
                    role="option"
                    aria-selected={isActive}
                    onPress={() => {
                      onSelect(network.ssid)
                      setIsOpen(false)
                    }}
                    alignItems="center"
                    gap="$12"
                    paddingVertical="$12"
                    paddingHorizontal="$12"
                    borderTopWidth={1}
                    borderColor="$border"
                    backgroundColor={isActive ? '$accentSoft' : 'transparent press:$surfaceElevated'}
                  >
                    <SignalIcon rssi={network.rssi} color={isActive ? theme.accentText?.val : theme.textSecondary?.val} />
                    <Text flex={1} fontFamily="$body" fontWeight={isActive ? '700' : '500'} fontSize={15} color="$textPrimary" numberOfLines={1}>
                      {network.ssid}
                    </Text>
                    {network.secure ? <Ionicons name="lock-closed" size={14} color={theme.textSecondary?.val} /> : null}
                    {isActive ? <Ionicons name="checkmark" size={18} color={theme.accentText?.val} /> : null}
                  </XStack>
                )
              })}
            </YStack>
          </FadeIn>
        </YStack>
      ) : null}
    </YStack>
  )
}

// A3: WLAN wählen (stärkstes Netz vorausgewählt), Passwort eingeben. Das Passwortfeld steht immer da
// (bei offenem WLAN gesperrt), damit der Knopf darunter nicht springt.
export function WifiCard({
  networks,
  selectedSsid,
  password,
  error,
  onSelect,
  onPasswordChange,
  onConnect,
  onScanQr,
  notice,
  back,
}: {
  networks: WifiNetwork[] | null
  selectedSsid: string | null
  password: string
  error?: string
  onSelect: (ssid: string) => void
  onPasswordChange: (value: string) => void
  onConnect: () => void
  onScanQr: () => void
  notice?: string
  back: ReactNode
}) {
  const theme = useTheme()
  const selected = networks?.find((network) => network.ssid === selectedSsid) ?? null
  const needsPassword = selected?.secure ?? true

  return (
    <Card allowOverflow>
      <Heading label="WLAN" title="Mit welchem WLAN?" text="Dein Sensor braucht WLAN, um dir Messwerte zu schicken." />
      <WifiSelect networks={networks} selectedSsid={selectedSsid} onSelect={onSelect} />
      <TextField
        label={needsPassword ? 'Passwort' : 'Kein Passwort nötig'}
        value={needsPassword ? password : ''}
        onChangeText={onPasswordChange}
        secureTextEntry
        autoCapitalize="none"
        editable={needsPassword && selected !== null}
        error={error}
      />
      {notice ? (
        <Text fontFamily="$body" fontSize={12} color="$success">
          {notice}
        </Text>
      ) : null}
      <XStack role="button" onPress={onScanQr} alignItems="center" gap="$6" alignSelf="flex-start">
        <Ionicons name="qr-code-outline" size={16} color={theme.accentText?.val} />
        <Text fontFamily="$body" fontSize={13} color="$textSecondary">
          Alternativ:{' '}
          <Text fontWeight="700" color="$accentText">
            QR-Code am Router scannen
          </Text>
        </Text>
      </XStack>
      <Button onPress={onConnect} disabled={!selected || (needsPassword && password.length === 0)}>
        Verbinden
      </Button>
      <XStack>{back}</XStack>
    </Card>
  )
}

const CONNECT_STEPS: { stage: ConnectStage; label: string }[] = [
  { stage: 'wifi', label: 'Mit dem WLAN verbunden' },
  { stage: 'claim', label: 'Bei Callgreen angemeldet' },
  { stage: 'done', label: 'Fertig eingerichtet' },
]

// A4: Verbinden läuft; Haken erscheinen nacheinander.
export function ConnectCard({ ssid, reached }: { ssid: string; reached: ConnectStage[] }) {
  const theme = useTheme()
  const firstOpen = CONNECT_STEPS.findIndex((step) => !reached.includes(step.stage))
  return (
    <Card>
      <Heading label="Verbinden" title="Einen Moment …" text={`Dein Sensor verbindet sich mit „${ssid}“.`} />
      <YStack gap="$12" paddingVertical="$8">
        {CONNECT_STEPS.map((step, index) => {
          const isDone = reached.includes(step.stage)
          const isRunning = index === firstOpen
          return (
            <XStack key={step.stage} alignItems="center" gap="$12" opacity={isDone || isRunning ? 1 : 0.4}>
              <YStack width={26} height={26} alignItems="center" justifyContent="center">
                {isDone ? (
                  <Ionicons name="checkmark-circle" size={24} color={theme.success?.val} />
                ) : isRunning ? (
                  <ActivityIndicator size="small" color={theme.accentText?.val} />
                ) : (
                  <Ionicons name="ellipse-outline" size={20} color={theme.textSecondary?.val} />
                )}
              </YStack>
              <Text fontFamily="$body" fontSize={15} fontWeight={isDone ? '600' : '500'} color={isDone ? '$textPrimary' : '$textSecondary'}>
                {step.label}
              </Text>
            </XStack>
          )
        })}
      </YStack>
    </Card>
  )
}

// A5: Kopplung fertig.
export function PairedCard({ deviceName, ssid, onNext, nextLabel = 'Weiter zur Pflanze' }: { deviceName: string; ssid: string; onNext: () => void; nextLabel?: string }) {
  const theme = useTheme()
  return (
    <Card>
      <Heading label="Sensor koppeln" title="Sensor verbunden!" />
      <IconStage>
        <Ionicons name="checkmark" size={40} color={theme.accentText?.val} />
      </IconStage>
      <YStack gap="$4" alignItems="center">
        <Text fontFamily="$body" fontWeight="600" fontSize={15} color="$textPrimary">
          {deviceName}
        </Text>
        <Text fontFamily="$body" fontSize={13} color="$textSecondary">
          im WLAN „{ssid}“
        </Text>
      </YStack>
      <Button onPress={onNext}>{nextLabel}</Button>
    </Card>
  )
}

// Vorschau-Ersatz für den Kamera-Scan (im Browser gibt es keine Kamera): Sucher-Rahmen und simulierter Treffer.
export function MockQrCard({ onFound, onClose }: { onFound: () => void; onClose: () => void }) {
  const theme = useTheme()
  return (
    <Card>
      <Heading label="WLAN" title="QR-Code scannen" text="Den Code findest du meist auf der Rückseite deines Routers." />
      <YStack height={200} borderRadius="$12" backgroundColor="$background" borderWidth={1} borderColor="$border" alignItems="center" justifyContent="center">
        <YStack width={130} height={130} borderRadius="$12" borderWidth={2} borderColor="$accent" alignItems="center" justifyContent="center">
          <Ionicons name="qr-code-outline" size={56} color={theme.textSecondary?.val} />
        </YStack>
      </YStack>
      <Button onPress={onFound}>Scan simulieren</Button>
      <Button variant="ghost" onPress={onClose}>
        Zurück zur Eingabe
      </Button>
    </Card>
  )
}
