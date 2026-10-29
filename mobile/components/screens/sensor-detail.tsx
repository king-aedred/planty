import { Badge, type BadgeTone } from '@/components/ui/badge'
import { BatteryIndicator } from '@/components/ui/battery-indicator'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FadeIn } from '@/components/ui/fade-in'
import { ListRow } from '@/components/ui/list-row'
import { SectionLabel } from '@/components/ui/section-label'
import { TextField } from '@/components/ui/text-field'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { type ComponentProps, type ReactNode, useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, useTheme, XStack, YStack } from 'tamagui'
import type { DemoSensor } from './demo-data'
import { DetailHeader } from './detail-header'

type SensorDetailProps = {
  sensor: DemoSensor
  onBack: () => void
  onOpenPlant?: () => void
  onAssignPlant: () => void
  onRemoved: () => void
  // Befehle an den Sensor (Vorschau: simuliert). Auflösung = Sensor hat bestätigt.
  runCommand: (command: 'measure' | 'wifi' | 'reset') => Promise<void>
  ignoreReducedMotion?: boolean
}

const STATUS: Record<DemoSensor['status'], { tone: BadgeTone; label: string }> = {
  active: { tone: 'success', label: 'Aktiv' },
  low_battery: { tone: 'warning', label: 'Akku schwach' },
  free: { tone: 'neutral', label: 'Frei' },
  offline: { tone: 'critical', label: 'Offline' },
}

function signalLevel(rssi: number) {
  if (rssi >= -55) return 4
  if (rssi >= -67) return 3
  if (rssi >= -78) return 2
  return 1
}

function InfoRow({ icon, label, value, divider }: { icon: ReactNode; label: string; value: ReactNode; divider?: boolean }) {
  return (
    <XStack alignItems="center" gap="$12" paddingVertical="$12" paddingHorizontal="$12" borderTopWidth={divider ? 1 : 0} borderColor="$border">
      <YStack width={22} alignItems="center">
        {icon}
      </YStack>
      <Text flex={1} fontFamily="$body" fontSize={14} color="$textSecondary">
        {label}
      </Text>
      {typeof value === 'string' ? (
        <Text fontFamily="$body" fontWeight="600" fontSize={14} color="$textPrimary">
          {value}
        </Text>
      ) : (
        value
      )}
    </XStack>
  )
}

type ActionState = { command: 'measure' | 'wifi' | 'reset'; phase: 'running' | 'done' } | null

// Sensor-Detail (Screen 10): Zustand, zugeordnete Pflanze, Befehle (messen, WLAN, Werkseinstellungen) und Entfernen.
export function SensorDetailScreen({ sensor, onBack, onOpenPlant, onAssignPlant, onRemoved, runCommand, ignoreReducedMotion }: SensorDetailProps) {
  const theme = useTheme()
  const [sheet, setSheet] = useState<'wifi' | 'reset' | 'remove' | null>(null)
  const [action, setAction] = useState<ActionState>(null)
  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const status = STATUS[sensor.status]
  const icon = (name: ComponentProps<typeof Ionicons>['name']) => <Ionicons name={name} size={18} color={theme.textSecondary?.val} />
  const level = signalLevel(sensor.rssi)

  useEffect(() => {
    if (action?.phase !== 'done') {
      return
    }
    const timer = setTimeout(() => setAction(null), 2600)
    return () => clearTimeout(timer)
  }, [action])

  const run = async (command: 'measure' | 'wifi' | 'reset') => {
    setSheet(null)
    setAction({ command, phase: 'running' })
    await runCommand(command)
    if (command === 'reset') {
      onRemoved()
      return
    }
    setAction({ command, phase: 'done' })
  }

  const actionText = action
    ? {
        measure: action.phase === 'running' ? 'Sensor misst …' : 'Neue Messung ist da',
        wifi: action.phase === 'running' ? 'Sensor wechselt das WLAN …' : `Verbunden mit „${ssid}“`,
        reset: 'Sensor wird zurückgesetzt …',
      }[action.command]
    : null

  return (
    <YStack flex={1} backgroundColor="$background">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 40 }}>
          <DetailHeader title="Sensor" onBack={onBack} />

          <FadeIn duration={400} offset={10} ignoreReducedMotion={ignoreReducedMotion}>
            <YStack alignItems="center" gap="$12" paddingVertical="$8">
              <YStack width={84} height={84} borderRadius="$999" backgroundColor="$accentSoft" borderWidth={1} borderColor="$accent" alignItems="center" justifyContent="center">
                <Ionicons name="radio" size={36} color={theme.accentText?.val} />
              </YStack>
              <Text fontFamily="$heading" fontSize={24} color="$textPrimary">
                {sensor.name}
              </Text>
              <XStack>
                <Badge tone={status.tone} label={status.label} />
              </XStack>
            </YStack>
          </FadeIn>

          {actionText ? (
            <FadeIn duration={250} offset={6} ignoreReducedMotion={ignoreReducedMotion}>
              <XStack alignItems="center" justifyContent="center" gap="$8" padding="$12" borderRadius="$12" backgroundColor={action?.phase === 'done' ? '$successSoft' : '$accentSoft'}>
                {action?.phase === 'done' ? (
                  <Ionicons name="checkmark-circle" size={18} color={theme.success?.val} />
                ) : (
                  <ActivityIndicator size="small" color={theme.accentText?.val} />
                )}
                <Text fontFamily="$body" fontWeight="600" fontSize={14} color="$textPrimary">
                  {actionText}
                </Text>
              </XStack>
            </FadeIn>
          ) : null}

          <FadeIn delay={80} duration={400} ignoreReducedMotion={ignoreReducedMotion}>
            <YStack gap="$8">
              <SectionLabel>Pflanze</SectionLabel>
              <Card dense>
                {sensor.plantName ? (
                  <ListRow leading={<Ionicons name="leaf" size={18} color={theme.success?.val} />} title={sensor.plantName} onPress={onOpenPlant} />
                ) : (
                  <ListRow leading={<Ionicons name="add-circle-outline" size={18} color={theme.accentText?.val} />} title="Einer Pflanze zuordnen" onPress={onAssignPlant} />
                )}
              </Card>
            </YStack>
          </FadeIn>

          <FadeIn delay={140} duration={400} ignoreReducedMotion={ignoreReducedMotion}>
            <YStack gap="$8">
              <SectionLabel>Zustand</SectionLabel>
              <Card dense>
                <InfoRow icon={icon('battery-half-outline')} label="Akku" value={<BatteryIndicator percent={sensor.battery} charging={sensor.charging} />} />
                <InfoRow
                  divider
                  icon={<MaterialCommunityIcons name={`wifi-strength-${level}` as 'wifi-strength-1'} size={18} color={theme.textSecondary?.val} />}
                  label="WLAN"
                  value={sensor.ssid}
                />
                <InfoRow divider icon={icon('time-outline')} label="Zuletzt gemeldet" value={sensor.lastSeen} />
                <InfoRow divider icon={icon('calendar-outline')} label="Nächste Messung" value={`${sensor.nextMeasurement} Uhr`} />
                <InfoRow divider icon={icon('hardware-chip-outline')} label="Firmware" value={`${sensor.firmware} · aktuell`} />
              </Card>
            </YStack>
          </FadeIn>

          <FadeIn delay={200} duration={400} ignoreReducedMotion={ignoreReducedMotion}>
            <YStack gap="$8">
              <SectionLabel>Aktionen</SectionLabel>
              <Card dense>
                <ListRow leading={icon('refresh-outline')} title="Jetzt messen" subtitle="Am Akku beim nächsten Aufwachen" onPress={() => void run('measure')} />
                <ListRow
                  divider
                  leading={icon('wifi-outline')}
                  title="WLAN ändern"
                  subtitle="Neuer Router oder neues Passwort"
                  onPress={() => {
                    setSsid('')
                    setPassword('')
                    setSheet('wifi')
                  }}
                />
                <ListRow divider leading={icon('reload-circle-outline')} title="Werkseinstellungen" subtitle="Sensor vergisst WLAN und Konto" onPress={() => setSheet('reset')} />
              </Card>
            </YStack>
          </FadeIn>

          <FadeIn delay={260} duration={400} ignoreReducedMotion={ignoreReducedMotion}>
            <Button variant="danger" onPress={() => setSheet('remove')}>
              Sensor entfernen
            </Button>
          </FadeIn>
        </ScrollView>
      </SafeAreaView>

      <BottomSheet visible={sheet !== null} onClose={() => setSheet(null)}>
        {sheet === 'wifi' ? (
          <>
            <Text fontFamily="$heading" fontSize={24} color="$textPrimary">
              WLAN ändern
            </Text>
            <Text fontFamily="$body" fontSize={14} lineHeight="$4" color="$textSecondary">
              Der Sensor probiert das neue WLAN aus. Klappt es nicht, bleibt er im alten.
            </Text>
            <TextField label="WLAN-Name" value={ssid} onChangeText={setSsid} autoCapitalize="none" />
            <TextField label="Passwort" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
            <Button onPress={() => void run('wifi')} disabled={!ssid.trim()}>
              An Sensor senden
            </Button>
          </>
        ) : sheet === 'reset' ? (
          <>
            <Text fontFamily="$heading" fontSize={24} color="$textPrimary">
              Auf Werkseinstellungen?
            </Text>
            <Text fontFamily="$body" fontSize={14} lineHeight="$4" color="$textSecondary">
              Der Sensor vergisst sein WLAN und wird aus deinem Konto entfernt. Danach kannst du ihn neu koppeln.
            </Text>
            <Button variant="danger" onPress={() => void run('reset')}>
              Zurücksetzen
            </Button>
            <Button variant="ghost" onPress={() => setSheet(null)}>
              Abbrechen
            </Button>
          </>
        ) : (
          <>
            <Text fontFamily="$heading" fontSize={24} color="$textPrimary">
              Sensor entfernen?
            </Text>
            <Text fontFamily="$body" fontSize={14} lineHeight="$4" color="$textSecondary">
              Der Sensor wird aus deinem Konto gelöst{sensor.plantName ? ` und ${sensor.plantName} bekommt keine Messwerte mehr` : ''}.
            </Text>
            <Button
              variant="danger"
              onPress={() => {
                setSheet(null)
                onRemoved()
              }}
            >
              Entfernen
            </Button>
            <Button variant="ghost" onPress={() => setSheet(null)}>
              Abbrechen
            </Button>
          </>
        )}
      </BottomSheet>
    </YStack>
  )
}
