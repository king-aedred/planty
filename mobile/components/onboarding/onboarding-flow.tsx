import { AuthShell, type AuthShellHelpers } from '@/components/auth/auth-shell'
import { CharacterPicker, type PlantCharacter } from '@/components/plants/character-picker'
import { PlantAvatar } from '@/components/plants/plant-avatar'
import { type Species, SpeciesPicker } from '@/components/plants/species-picker'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChoiceCard } from '@/components/ui/choice-card'
import { SectionLabel } from '@/components/ui/section-label'
import { TextField } from '@/components/ui/text-field'
import { Ionicons } from '@expo/vector-icons'
import React, { type ComponentProps } from 'react'
import { Text, useTheme, XStack, YStack } from 'tamagui'
import { type ConnectFailure, type ConnectStage, type PairingAdapter, type WifiNetwork } from './sensor-pairing'
import { WifiQrScanner } from '@/components/ui/wifi-qr-scanner'
import { type ChannelAdapter } from './channel-setup'
import { CallSetupCard, PushSetupCard, TelegramSetupCard } from './channel-steps'
import { ConnectCard, MockQrCard, PairedCard, PlugInCard, ScanCard, WifiCard } from './sensor-steps'

export type NotifyChannel = 'push' | 'telegram' | 'call'

// Ergebnis des Onboardings; das Anlegen übernimmt der Aufrufer (echt: Convex, Vorschau: nichts).
export type OnboardingResult = {
  withSensor: boolean
  // Gekoppelter Sensor (device_id), sonst null.
  deviceId: string | null
  // pair-sensor: bestehende Pflanze, die den Sensor bekommt; null = neue Pflanze anlegen.
  assignedPlantId: string | null
  species: Species | null
  name: string
  character: PlantCharacter
  channels: NotifyChannel[]
}

type Step =
  | 'start'
  | 'plugin'
  | 'scan'
  | 'wifi'
  | 'qr'
  | 'connect'
  | 'paired'
  | 'legacy-pair'
  | 'assign'
  | 'plant'
  | 'character'
  | 'channels'
  | 'push-setup'
  | 'telegram-setup'
  | 'call-setup'
  | 'ready'

type OnboardingFlowProps = {
  // Arten passend zur Suche (echt: Convex-Suche, Vorschau: Beispielliste).
  // Hook: wird bei jedem Rendern mit dem aktuellen Suchtext aufgerufen (echt: useQuery, Vorschau: Beispielliste).
  useSpeciesSearch: (search: string) => Species[]
  // „Später“ oder „Los geht's“: wohin danach (Dashboard).
  homePath: string
  // Anlegen (echt: Convex). Gibt eine Fehlermeldung zurück, wenn es nicht geklappt hat.
  onComplete?: (result: OnboardingResult) => Promise<string | null> | void
  // „Später“ im Onboarding (echt: Onboarding als erledigt markieren).
  onSkip?: () => void
  // Bis zur neuen BLE-Anbindung (Phase B): bestehender Kopplungs-Baustein statt der neuen Schritte.
  // Ruft onPaired mit der device_id, sobald der Sensor zugeordnet ist.
  legacyPairing?: (onPaired: (deviceId: string) => void) => React.ReactNode
  // add-plant: schon gekoppelter, freier Sensor (z. B. aus dem Sensor-Detail); Sensor-Schritte entfallen.
  presetDeviceId?: string
  // Technik hinter der Sensor-Kopplung (Vorschau: mockPairing).
  pairing: PairingAdapter
  // Technik hinter der Kanal-Einrichtung (Vorschau: mockChannels).
  channelSetup: ChannelAdapter
  // onboarding: erste Anmeldung (mit Kanälen). add-plant: Pflanze hinzufügen (Sensor optional).
  // pair-sensor: Sensor koppeln und einer Pflanze zuordnen (bestehende ohne Sensor oder neue).
  mode?: 'onboarding' | 'add-plant' | 'pair-sensor'
  // Innerhalb der App: Abbrechen und Fertig rufen das auf, statt zu homePath zu navigieren.
  onExit?: () => void
  // pair-sensor: Pflanzen ohne Sensor, denen der neue Sensor zugeordnet werden kann.
  freePlants?: { id: string; name: string }[]
  preview?: boolean
}


// Schritte der Sensor-Kopplung, für Pfad und Fortschrittsleiste.
const SENSOR_STEPS: Step[] = ['plugin', 'scan', 'wifi', 'connect', 'paired']
const LEGACY_SENSOR_STEPS: Step[] = ['legacy-pair']
// Einrichtung der gewählten Kanäle, in dieser Reihenfolge nach der Kanal-Auswahl.
const CHANNEL_SETUP: { channel: NotifyChannel; step: Step }[] = [
  { channel: 'push', step: 'push-setup' },
  { channel: 'telegram', step: 'telegram-setup' },
  { channel: 'call', step: 'call-setup' },
]

const CONNECT_ERRORS: Record<ConnectFailure, string> = {
  auth_failed: 'Das Passwort stimmt nicht.',
  not_found: 'Der Sensor erreicht dieses WLAN nicht. Steht er zu weit weg?',
  timeout: 'Das hat zu lange gedauert. Versuch es noch mal.',
  other: 'Das hat nicht geklappt. Versuch es noch mal.',
}

// Onboarding nach der ersten Anmeldung (Plan in docs/SCREENS.md): Start → (Sensor) → Pflanze → Persönlichkeit
// → Kanäle → fertig. Jeder Schritt tauscht nur die Box im gemeinsamen Auth-Rahmen.
export function OnboardingFlow({
  useSpeciesSearch,
  homePath,
  onComplete,
  pairing,
  channelSetup,
  mode = 'onboarding',
  onExit,
  freePlants = [],
  onSkip,
  legacyPairing,
  presetDeviceId,
  preview = false,
}: OnboardingFlowProps) {
  const shell = React.useRef<AuthShellHelpers | null>(null)
  const firstSensorStep: Step = legacyPairing ? 'legacy-pair' : 'plugin'
  const [step, setStep] = React.useState<Step>(mode === 'pair-sensor' ? firstSensorStep : presetDeviceId ? 'plant' : 'start')
  const [withSensor, setWithSensor] = React.useState(mode === 'pair-sensor')
  // pair-sensor: bestehende Pflanze, der der Sensor zugeordnet wird (null = neue Pflanze anlegen).
  const [assignedPlant, setAssignedPlant] = React.useState<{ id: string; name: string } | null>(null)
  // Über den bestehenden Kopplungs-Baustein gekoppelter Sensor.
  const [legacyDeviceId, setLegacyDeviceId] = React.useState<string | null>(presetDeviceId ?? null)
  const [isCompleting, setIsCompleting] = React.useState(false)
  const [completeError, setCompleteError] = React.useState('')
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

  const setupSteps = CHANNEL_SETUP.filter((entry) => channels.includes(entry.channel)).map((entry) => entry.step)
  const plantSteps: Step[] = mode === 'pair-sensor' ? ['assign', ...(assignedPlant ? [] : (['plant', 'character'] as Step[]))] : ['plant', 'character']
  const path: Step[] = [
    ...(withSensor ? (legacyPairing ? LEGACY_SENSOR_STEPS : SENSOR_STEPS) : []),
    ...plantSteps,
    ...(mode === 'onboarding' ? (['channels', ...setupSteps] as Step[]) : []),
    'ready',
  ]
  // Nächster bzw. vorheriger Schritt im aktuellen Pfad; vor dem ersten Schritt liegt der Start (bzw. Abbrechen).
  const stepAfter = (current: Step): Step => path[path.indexOf(current) + 1] ?? 'ready'
  const stepBefore = (current: Step): Step | null => {
    const index = path.indexOf(current)
    return index > 0 ? path[index - 1] : mode === 'pair-sensor' ? null : 'start'
  }
  // Der QR-Scan zählt als Teil des WLAN-Schritts.
  const progressStep = step === 'qr' ? 'wifi' : step
  const progress = step === 'start' ? 0 : (path.indexOf(progressStep) + 1) / path.length
  const speciesMatches = useSpeciesSearch(speciesSearch)
  const speciesName = species?.common_name ?? manualSpecies.trim()
  // Leer gelassener Name: die Pflanze heißt wie ihre Art.
  const plantName = assignedPlant?.name ?? (nickname.trim() || speciesName || 'Deine Pflanze')

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

  // Ablauf verlassen: in der App zurück (onExit), sonst ins Dashboard.
  const leave = () => {
    if (onExit) {
      shell.current?.exit(onExit)
    } else {
      shell.current?.finish(homePath)
    }
  }

  const complete = async () => {
    if (isCompleting) {
      return
    }
    setCompleteError('')
    setIsCompleting(true)
    const error = await onComplete?.({
      withSensor,
      deviceId: legacyDeviceId ?? device?.deviceId ?? null,
      assignedPlantId: assignedPlant?.id ?? null,
      species,
      name: plantName,
      character: character ?? 'neutral',
      channels,
    })
    setIsCompleting(false)
    if (error) {
      setCompleteError(error)
      return
    }
    leave()
  }

  // Zurück zum vorherigen Schritt; ohne vorherigen Schritt (Ablauf in der App) heißt es „Abbrechen“.
  const backLink = (target: Step | null) => (
    <Text fontFamily="$body" fontSize={14} color="$textSecondary" onPress={() => (target ? goTo(target) : leave())} role="button">
      {target ? 'Zurück' : 'Abbrechen'}
    </Text>
  )

  return (
    <AuthShell preview={preview} progress={progress} smoothLayout>
      {(helpers) => {
        shell.current = helpers

        if (step === 'legacy-pair' && legacyPairing) {
          return (
            <YStack gap="$12">
              {legacyPairing((deviceId) => {
                setLegacyDeviceId(deviceId)
                goTo(stepAfter('legacy-pair'))
              })}
              <XStack paddingHorizontal="$4">{backLink(stepBefore('legacy-pair'))}</XStack>
            </YStack>
          )
        }

        if (step === 'plugin') {
          return <PlugInCard onNext={startScan} back={backLink(stepBefore('plugin'))} />
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
          return (
            <PairedCard
              deviceName={device?.deviceName ?? 'Dein Sensor'}
              ssid={ssid ?? ''}
              nextLabel={mode === 'pair-sensor' ? 'Weiter' : 'Weiter zur Pflanze'}
              onNext={() => goTo(stepAfter('paired'))}
            />
          )
        }

        if (step === 'assign') {
          return (
            <Card>
              <SectionLabel>Zuordnen</SectionLabel>
              <Text fontFamily="$heading" color="$textPrimary" fontSize="$8" marginTop="$4" marginBottom="$4">
                Zu welcher Pflanze gehört er?
              </Text>
              <YStack gap="$8">
                {freePlants.map((plant) => (
                  <ChoiceCard
                    key={plant.id}
                    title={plant.name}
                    description="Hat noch keinen Sensor"
                    selected={assignedPlant?.id === plant.id}
                    onPress={() => setAssignedPlant(plant)}
                  />
                ))}
                <ChoiceCard title="Neue Pflanze anlegen" description="Art, Name und Persönlichkeit" selected={assignedPlant === null} onPress={() => setAssignedPlant(null)} />
              </YStack>
              <Button onPress={() => goTo(assignedPlant ? 'ready' : 'plant')}>Weiter</Button>
            </Card>
          )
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
                results={species ? [] : speciesMatches}
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
              <XStack>{backLink(stepBefore('plant'))}</XStack>
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
              <CharacterPicker value={character} onChange={setCharacter} />
              <Button onPress={() => goTo(stepAfter('character'))} disabled={!character}>
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
                <ChannelOption
                  icon="call-outline"
                  title="Anruf"
                  description="Bei Notfällen ruft sie dich an"
                  selected={channels.includes('call')}
                  onPress={() => toggleChannel('call')}
                />
              </YStack>
              <Button onPress={() => goTo(stepAfter('channels'))}>{channels.length > 0 ? 'Weiter' : 'Ohne Benachrichtigungen weiter'}</Button>
              <XStack>{backLink('character')}</XStack>
            </Card>
          )
        }

        if (step === 'push-setup' || step === 'telegram-setup' || step === 'call-setup') {
          const setupProps = {
            plantName,
            channels: channelSetup,
            onDone: () => goTo(stepAfter(step)),
            back: backLink(stepBefore(step)),
            ignoreReducedMotion: preview,
          }
          if (step === 'push-setup') {
            return <PushSetupCard key={step} {...setupProps} />
          }
          if (step === 'telegram-setup') {
            return <TelegramSetupCard key={step} {...setupProps} />
          }
          return <CallSetupCard key={step} {...setupProps} />
        }

        if (step === 'ready') {
          return (
            <Card>
              <YStack alignItems="center" gap="$12" paddingVertical="$8">
                <PlantAvatar mood={character ?? 'neutral'} status="success" size={88} />
                <Text fontFamily="$heading" color="$textPrimary" fontSize="$8" textAlign="center">
                  {assignedPlant ? `${plantName} hat jetzt einen Sensor!` : `${plantName} ist bereit!`}
                </Text>
                <Text fontFamily="$body" color="$textSecondary" fontSize={15} lineHeight="$5" textAlign="center">
                  {withSensor || presetDeviceId
                    ? `Sobald dein Sensor misst, meldet sich ${plantName} bei dir.`
                    : 'Ohne Sensor gibt es noch keine Messwerte. Du kannst jederzeit einen koppeln.'}
                </Text>
              </YStack>
              {completeError ? (
                <Text fontFamily="$body" fontSize={12} color="$critical" textAlign="center">
                  {completeError}
                </Text>
              ) : null}
              <Button onPress={() => void complete()} loading={isCompleting}>
                {mode === 'onboarding' ? 'Los geht\'s' : 'Fertig'}
              </Button>
              <XStack>{backLink(stepBefore('ready'))}</XStack>
            </Card>
          )
        }

        if (mode === 'add-plant') {
          return (
            <Card>
              <SectionLabel>Neue Pflanze</SectionLabel>
              <Text fontFamily="$heading" color="$textPrimary" fontSize="$8" marginTop="$4" marginBottom="$4">
                Bekommt sie einen Sensor?
              </Text>
              <Button
                onPress={() => {
                  setWithSensor(true)
                  goTo(firstSensorStep)
                }}
              >
                Ja, Sensor koppeln
              </Button>
              <Button
                variant="secondary"
                onPress={() => {
                  setWithSensor(false)
                  goTo('plant')
                }}
              >
                Nein, ohne Sensor
              </Button>
              <Button variant="ghost" onPress={leave}>
                Abbrechen
              </Button>
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
                goTo(firstSensorStep)
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
            <Button
              variant="ghost"
              onPress={() => {
                onSkip?.()
                helpers.finish(homePath)
              }}
            >
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
