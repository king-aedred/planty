import { AuthShell, type AuthShellHelpers } from '@/components/auth/auth-shell'
import { PlantAvatar } from '@/components/plants/plant-avatar'
import { type Species, SpeciesPicker } from '@/components/plants/species-picker'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SectionLabel } from '@/components/ui/section-label'
import { TextField } from '@/components/ui/text-field'
import { Ionicons } from '@expo/vector-icons'
import React, { type ComponentProps } from 'react'
import { Text, useTheme, XStack, YStack } from 'tamagui'
import { type ConnectFailure, type ConnectStage, type PairingAdapter, type WifiNetwork } from './sensor-pairing'
import { WifiQrScanner } from '@/components/ui/wifi-qr-scanner'
import { ConnectCard, MockQrCard, PairedCard, PlugInCard, ScanCard, WifiCard } from './sensor-steps'

export type PlantCharacter = 'happy' | 'grumpy' | 'neutral'
export type NotifyChannel = 'push' | 'telegram'

// Ergebnis des Onboardings; das Anlegen übernimmt der Aufrufer (echt: Convex, Vorschau: nichts).
export type OnboardingResult = {
  withSensor: boolean
  species: Species | null
  name: string
  character: PlantCharacter
  channels: NotifyChannel[]
}

type Step = 'start' | 'plugin' | 'scan' | 'wifi' | 'qr' | 'connect' | 'paired' | 'plant' | 'character' | 'channels' | 'ready'

type OnboardingFlowProps = {
  // Arten passend zur Suche (echt: Convex-Suche, Vorschau: Beispielliste).
  searchSpecies: (search: string) => Species[]
  // „Später“ oder „Los geht's“: wohin danach (Dashboard).
  homePath: string
  onComplete?: (result: OnboardingResult) => void
  // Technik hinter der Sensor-Kopplung (Vorschau: mockPairing).
  pairing: PairingAdapter
  preview?: boolean
}

const CHARACTERS: { value: PlantCharacter; label: string; description: string; color: string; soft: string }[] = [
  { value: 'happy', label: 'Fröhlich', description: 'Durch und durch optimistisch', color: '$characterHappy', soft: '$characterHappySoft' },
  { value: 'grumpy', label: 'Grummelig', description: 'Nimmt kein Blatt vor den Mund', color: '$characterGrumpy', soft: '$characterGrumpySoft' },
  { value: 'neutral', label: 'Gelassen', description: 'Alles, bloß kein Drama', color: '$characterNeutral', soft: '$characterNeutralSoft' },
]

// Reihenfolge der Schritte je Pfad, für die Fortschrittsleiste.
const SENSOR_PATH: Step[] = ['plugin', 'scan', 'wifi', 'connect', 'paired', 'plant', 'character', 'channels', 'ready']
const PLANT_PATH: Step[] = ['plant', 'character', 'channels', 'ready']

const CONNECT_ERRORS: Record<ConnectFailure, string> = {
  auth_failed: 'Das Passwort stimmt nicht.',
  not_found: 'Der Sensor erreicht dieses WLAN nicht. Steht er zu weit weg?',
  timeout: 'Das hat zu lange gedauert. Versuch es noch mal.',
  other: 'Das hat nicht geklappt. Versuch es noch mal.',
}

// Onboarding nach der ersten Anmeldung (Plan in docs/SCREENS.md): Start → (Sensor) → Pflanze → Persönlichkeit
// → Kanäle → fertig. Jeder Schritt tauscht nur die Box im gemeinsamen Auth-Rahmen.
export function OnboardingFlow({ searchSpecies, homePath, onComplete, pairing, preview = false }: OnboardingFlowProps) {
  const shell = React.useRef<AuthShellHelpers | null>(null)
  const [step, setStep] = React.useState<Step>('start')
  const [withSensor, setWithSensor] = React.useState(false)
  const [speciesSearch, setSpeciesSearch] = React.useState('')
  const [species, setSpecies] = React.useState<Species | null>(null)
  const [isManual, setIsManual] = React.useState(false)
  const [manualSpecies, setManualSpecies] = React.useState('')
  const [nickname, setNickname] = React.useState('')
  const [character, setCharacter] = React.useState<PlantCharacter | null>(null)
  const [channels, setChannels] = React.useState<NotifyChannel[]>(['push'])
  // Sensor-Kopplung
  const [scanState, setScanState] = React.useState<'searching' | 'found' | 'missing'>('searching')
  const [device, setDevice] = React.useState<{ deviceName: string; deviceId: string } | null>(null)
  const [networks, setNetworks] = React.useState<WifiNetwork[] | null>(null)
  const [ssid, setSsid] = React.useState<string | null>(null)
  const [wifiPassword, setWifiPassword] = React.useState('')
  const [wifiError, setWifiError] = React.useState('')
  const [wifiNotice, setWifiNotice] = React.useState('')
  const [reached, setReached] = React.useState<ConnectStage[]>([])

  // Suche starten, sobald der Such-Schritt offen ist.
  React.useEffect(() => {
    if (step !== 'scan' || scanState !== 'searching') {
      return
    }
    let cancelled = false
    void pairing.scan().then((found) => {
      if (cancelled) {
        return
      }
      if (found) {
        setDevice(found)
        setScanState('found')
      } else {
        shell.current?.swap(() => setScanState('missing'))
      }
    })
    return () => {
      cancelled = true
    }
  }, [pairing, scanState, step])

  // WLAN-Liste vom Sensor holen, sobald der WLAN-Schritt offen ist.
  React.useEffect(() => {
    if (step !== 'wifi' || networks !== null) {
      return
    }
    let cancelled = false
    void pairing.listNetworks().then((list) => {
      if (!cancelled) {
        const sorted = [...list].sort((first, second) => second.rssi - first.rssi)
        setNetworks(sorted)
        // Stärkstes Netz vorauswählen.
        setSsid((current) => current ?? sorted[0]?.ssid ?? null)
      }
    })
    return () => {
      cancelled = true
    }
  }, [networks, pairing, step])

  const path = withSensor ? SENSOR_PATH : PLANT_PATH
  // Der QR-Scan zählt als Teil des WLAN-Schritts.
  const progressStep = step === 'qr' ? 'wifi' : step
  const progress = step === 'start' ? 0 : (path.indexOf(progressStep) + 1) / path.length
  const speciesName = species?.common_name ?? manualSpecies.trim()
  // Leer gelassener Name: die Pflanze heißt wie ihre Art.
  const plantName = nickname.trim() || speciesName || 'Deine Pflanze'

  const goTo = (next: Step) => {
    if (shell.current) {
      shell.current.swap(() => setStep(next))
    } else {
      setStep(next)
    }
  }

  const startScan = () => {
    setScanState('searching')
    setDevice(null)
    goTo('scan')
  }

  const connect = () => {
    if (!ssid) {
      return
    }
    setWifiError('')
    setReached([])
    goTo('connect')
    void pairing
      .connect(ssid, wifiPassword, (stage) => setReached((current) => [...current, stage]))
      .then((result) => {
        if (result.ok) {
          setTimeout(() => goTo('paired'), 600)
          return
        }
        setWifiPassword('')
        setWifiError(CONNECT_ERRORS[result.reason])
        goTo('wifi')
      })
  }

  // QR-Code vom Router gelesen: Netz übernehmen (notfalls zur Liste hinzufügen) und Passwort eintragen.
  const applyScannedWifi = (scanned: { ssid: string; password: string }) => {
    setNetworks((current) => {
      const list = current ?? []
      return list.some((network) => network.ssid === scanned.ssid) ? list : [{ ssid: scanned.ssid, rssi: -60, secure: scanned.password.length > 0 }, ...list]
    })
    setSsid(scanned.ssid)
    setWifiPassword(scanned.password)
    setWifiError('')
    setWifiNotice('Code erkannt. Prüf kurz das WLAN und tipp auf Verbinden.')
    goTo('wifi')
  }

  const toggleChannel = (channel: NotifyChannel) => {
    setChannels((current) => (current.includes(channel) ? current.filter((entry) => entry !== channel) : [...current, channel]))
  }

  const complete = () => {
    onComplete?.({ withSensor, species, name: plantName, character: character ?? 'neutral', channels })
    shell.current?.finish(homePath)
  }

  const backLink = (target: Step) => (
    <Text fontFamily="$body" fontSize={14} color="$textSecondary" onPress={() => goTo(target)} role="button">
      Zurück
    </Text>
  )

  return (
    <AuthShell preview={preview} progress={progress} smoothLayout>
      {(helpers) => {
        shell.current = helpers

        if (step === 'plugin') {
          return <PlugInCard onNext={startScan} back={backLink('start')} />
        }

        if (step === 'scan') {
          return (
            <ScanCard
              state={scanState}
              deviceName={device?.deviceName}
              onRetry={() => shell.current?.swap(() => setScanState('searching'))}
              onNext={() => goTo('wifi')}
              back={backLink('plugin')}
              ignoreReducedMotion={preview}
            />
          )
        }

        if (step === 'wifi') {
          return (
            <WifiCard
              networks={networks}
              selectedSsid={ssid}
              password={wifiPassword}
              error={wifiError}
              onSelect={(value) => {
                setSsid(value)
                setWifiPassword('')
                setWifiError('')
                setWifiNotice('')
              }}
              onPasswordChange={setWifiPassword}
              onConnect={connect}
              onScanQr={() => {
                setWifiNotice('')
                goTo('qr')
              }}
              notice={wifiNotice}
              back={backLink('scan')}
            />
          )
        }

        if (step === 'qr') {
          return preview ? (
            <MockQrCard onFound={() => applyScannedWifi({ ssid: 'FRITZ!Box 7590 XY', password: '12345678' })} onClose={() => goTo('wifi')} />
          ) : (
            <WifiQrScanner
              onFound={applyScannedWifi}
              onClose={() => goTo('wifi')}
              onError={(message) => {
                setWifiError(message)
                goTo('wifi')
              }}
            />
          )
        }

        if (step === 'connect') {
          return <ConnectCard ssid={ssid ?? ''} reached={reached} />
        }

        if (step === 'paired') {
          return <PairedCard deviceName={device?.deviceName ?? 'Dein Sensor'} ssid={ssid ?? ''} onNext={() => goTo('plant')} />
        }

        if (step === 'plant') {
          const canContinue = Boolean(species || (isManual && manualSpecies.trim()))
          return (
            <Card allowOverflow>
              <SectionLabel>Deine Pflanze</SectionLabel>
              <Text fontFamily="$heading" color="$textPrimary" fontSize="$8" marginTop="$4" marginBottom="$4">
                Welche Pflanze ist es?
              </Text>
              <SpeciesPicker
                search={speciesSearch}
                onSearchChange={(value) => {
                  setSpeciesSearch(value)
                  setSpecies(null)
                  setIsManual(false)
                }}
                results={species ? [] : searchSpecies(speciesSearch)}
                selected={species}
                onSelect={(selected) => {
                  setSpecies(selected)
                  setIsManual(false)
                }}
                onManualEntry={() => {
                  setIsManual(true)
                  setManualSpecies(speciesSearch.trim())
                }}
                manual={isManual}
              />
              {canContinue ? (
                <YStack gap="$4">
                  <TextField label="Wie soll sie heißen? (optional)" value={nickname} onChangeText={setNickname} autoCapitalize="words" />
                  <Text fontFamily="$body" fontSize={12} color="$textSecondary">
                    Leer lassen, dann heißt sie „{speciesName}“.
                  </Text>
                </YStack>
              ) : null}
              <Button onPress={() => goTo('character')} disabled={!canContinue}>
                Weiter
              </Button>
              <XStack>{backLink(withSensor ? 'paired' : 'start')}</XStack>
            </Card>
          )
        }

        if (step === 'character') {
          return (
            <Card>
              <SectionLabel>Persönlichkeit</SectionLabel>
              <Text fontFamily="$heading" color="$textPrimary" fontSize="$8" marginTop="$4" marginBottom="$4">
                Wie tickt {plantName}?
              </Text>
              <XStack gap="$8">
                {CHARACTERS.map((option) => {
                  const isActive = character === option.value
                  return (
                    <YStack
                      key={option.value}
                      role="radio"
                      aria-checked={isActive}
                      flex={1}
                      onPress={() => setCharacter(option.value)}
                      alignItems="center"
                      gap="$6"
                      paddingVertical="$16"
                      paddingHorizontal="$4"
                      borderRadius="$16"
                      borderWidth={1}
                      borderColor={isActive ? option.color : '$border'}
                      backgroundColor={isActive ? option.soft : '$surface press:$surfaceElevated'}
                    >
                      <PlantAvatar mood={option.value} status="success" size={52} />
                      <Text fontFamily="$body" fontWeight="700" fontSize={14} color={isActive ? option.color : '$textPrimary'}>
                        {option.label}
                      </Text>
                      <Text fontFamily="$body" fontSize={11} color="$textSecondary" textAlign="center">
                        {option.description}
                      </Text>
                    </YStack>
                  )
                })}
              </XStack>
              <Button onPress={() => goTo('channels')} disabled={!character}>
                Weiter
              </Button>
              <XStack>{backLink('plant')}</XStack>
            </Card>
          )
        }

        if (step === 'channels') {
          return (
            <Card>
              <SectionLabel>Benachrichtigungen</SectionLabel>
              <Text fontFamily="$heading" color="$textPrimary" fontSize="$8" marginTop="$4" marginBottom="$4">
                Wie darf {plantName} sich bei dir melden?
              </Text>
              <YStack gap="$8">
                <ChannelOption
                  icon="notifications-outline"
                  title="Push"
                  description="Mitteilung aufs Handy"
                  selected={channels.includes('push')}
                  onPress={() => toggleChannel('push')}
                />
                <ChannelOption
                  icon="paper-plane-outline"
                  title="Telegram"
                  description="Nachricht im Telegram-Chat"
                  selected={channels.includes('telegram')}
                  onPress={() => toggleChannel('telegram')}
                />
                <ChannelOption icon="call-outline" title="Anruf" description="Kommt bald" selected={false} disabled />
              </YStack>
              <Button onPress={() => goTo('ready')}>{channels.length > 0 ? 'Weiter' : 'Ohne Benachrichtigungen weiter'}</Button>
              <XStack>{backLink('character')}</XStack>
            </Card>
          )
        }

        if (step === 'ready') {
          return (
            <Card>
              <YStack alignItems="center" gap="$12" paddingVertical="$8">
                <PlantAvatar mood={character ?? 'neutral'} status="success" size={88} />
                <Text fontFamily="$heading" color="$textPrimary" fontSize="$8" textAlign="center">
                  {plantName} ist bereit!
                </Text>
                <Text fontFamily="$body" color="$textSecondary" fontSize={15} lineHeight="$5" textAlign="center">
                  {withSensor
                    ? `Sobald dein Sensor misst, meldet sich ${plantName} bei dir.`
                    : 'Ohne Sensor gibt es noch keine Messwerte. Du kannst jederzeit einen koppeln.'}
                </Text>
              </YStack>
              <Button onPress={complete}>Los geht&apos;s</Button>
              <XStack>{backLink('channels')}</XStack>
            </Card>
          )
        }

        return (
          <Card>
            <SectionLabel>Willkommen</SectionLabel>
            <Text fontFamily="$heading" color="$textPrimary" fontSize="$8" marginTop="$4" marginBottom="$4">
              Schön, dass du da bist!
            </Text>
            <Button
              onPress={() => {
                setWithSensor(true)
                goTo('plugin')
              }}
            >
              Ich habe einen Sensor
            </Button>
            <Button
              variant="secondary"
              onPress={() => {
                setWithSensor(false)
                goTo('plant')
              }}
            >
              Nur eine Pflanze anlegen
            </Button>
            <Button variant="ghost" onPress={() => helpers.finish(homePath)}>
              Später
            </Button>
          </Card>
        )
      }}
    </AuthShell>
  )
}

type ChannelOptionProps = {
  icon: ComponentProps<typeof Ionicons>['name']
  title: string
  description: string
  selected: boolean
  onPress?: () => void
  disabled?: boolean
}

// Zeile zum An-/Abwählen eines Kanals (Mehrfachauswahl).
function ChannelOption({ icon, title, description, selected, onPress, disabled = false }: ChannelOptionProps) {
  const theme = useTheme()
  return (
    <XStack
      role="checkbox"
      aria-checked={selected}
      aria-disabled={disabled}
      onPress={disabled ? undefined : onPress}
      alignItems="center"
      gap="$12"
      padding="$12"
      borderRadius="$12"
      borderWidth={1}
      borderColor={selected ? '$accent' : '$border'}
      backgroundColor={selected ? '$accentSoft' : disabled ? 'transparent' : '$surface press:$surfaceElevated'}
      opacity={disabled ? 0.5 : 1}
    >
      <Ionicons name={icon} size={22} color={selected ? theme.accentText?.val : theme.textSecondary?.val} />
      <YStack flex={1} gap="$2">
        <Text fontFamily="$body" fontWeight="600" fontSize={15} color="$textPrimary">
          {title}
        </Text>
        <Text fontFamily="$body" fontSize={13} color="$textSecondary">
          {description}
        </Text>
      </YStack>
      <YStack
        width={22}
        height={22}
        borderRadius="$2"
        borderWidth={1}
        borderColor={selected ? '$accent' : '$outline'}
        backgroundColor={selected ? '$accent' : 'transparent'}
        alignItems="center"
        justifyContent="center"
      >
        {selected ? <Ionicons name="checkmark" size={14} color={theme.textOnAccent?.val} /> : null}
      </YStack>
    </XStack>
  )
}
