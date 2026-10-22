import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, Theme, XStack, YStack } from 'tamagui'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { EmptyState } from '../components/ui/empty-state'
import { ErrorNotice } from '../components/ui/error-notice'
import { ListRow } from '../components/ui/list-row'
import { SectionLabel } from '../components/ui/section-label'
import { type DeviceState, StatusBadge } from '../components/ui/status-badge'

// Testseite für das Theme-Fundament (Schritt 1). Nicht verlinkt; erreichbar unter /ui-preview.
// Zeigt alle Bausteine einmal im dunklen und einmal im hellen Theme.

const DEVICE_STATES: DeviceState[] = [
  'active',
  'offline',
  'charging',
  'measuring',
  'needs_remeasurement',
  'battery_low',
  'battery_critical',
  'unknown',
]

const CHARACTERS = [
  { key: 'Happy', label: 'happy' },
  { key: 'Grumpy', label: 'grumpy' },
  { key: 'Neutral', label: 'neutral' },
] as const

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <YStack alignItems="center" gap="$4" width={64}>
      <YStack width={40} height={40} borderRadius="$12" backgroundColor={color} borderWidth={1} borderColor="$border" />
      <Text fontFamily="$body" fontSize={11} color="$textSecondary" textAlign="center">
        {label}
      </Text>
    </YStack>
  )
}

function Showcase({ scheme }: { scheme: 'dark' | 'light' }) {
  return (
    <Theme name={scheme}>
      <YStack backgroundColor="$background" padding="$20" gap="$20">
        <YStack gap="$4">
          <SectionLabel>{scheme === 'dark' ? 'Dark Mode' : 'Light Mode'}</SectionLabel>
          <Text fontFamily="$heading" fontSize={28} color="$textPrimary">
            Callgreen
          </Text>
          <Text fontFamily="$body" fontSize={14} color="$textSecondary">
            Ruhige Flächen, Akzent nur für Primäraktionen und aktive Zustände.
          </Text>
        </YStack>

        <Card>
          <SectionLabel>Farben</SectionLabel>
          <XStack flexWrap="wrap" gap="$8">
            <Swatch color="$background" label="background" />
            <Swatch color="$surface" label="surface" />
            <Swatch color="$surfaceElevated" label="elevated" />
            <Swatch color="$accent" label="accent" />
            <Swatch color="$success" label="success" />
            <Swatch color="$warning" label="warning" />
            <Swatch color="$critical" label="critical" />
          </XStack>
          <SectionLabel>Charaktere</SectionLabel>
          <XStack gap="$8">
            {CHARACTERS.map((character) => (
              <XStack
                key={character.key}
                alignItems="center"
                gap="$6"
                backgroundColor={`$character${character.key}Soft`}
                borderRadius="$999"
                paddingVertical="$4"
                paddingHorizontal="$12"
              >
                <YStack width={8} height={8} borderRadius="$999" backgroundColor={`$character${character.key}`} />
                <Text fontFamily="$body" fontWeight="600" fontSize={13} color={`$character${character.key}`}>
                  {character.label}
                </Text>
              </XStack>
            ))}
          </XStack>
        </Card>

        <Card>
          <SectionLabel>Gerätezustände</SectionLabel>
          <XStack flexWrap="wrap" gap="$8">
            {DEVICE_STATES.map((state) => (
              <StatusBadge key={state} state={state} />
            ))}
          </XStack>
        </Card>

        <Card dense>
          <ListRow title="Monstera" subtitle="cg-00A5D8 · zuletzt vor 12 Min." trailing={<StatusBadge state="active" />} onPress={() => undefined} />
          <ListRow title="Basilikum" subtitle="cg-1F2E3D · meldet sich nicht" trailing={<StatusBadge state="offline" />} onPress={() => undefined} divider />
          <ListRow title="Kaktus" subtitle="Kein Sensor verbunden" divider />
        </Card>

        <Card>
          <SectionLabel>Aktionen</SectionLabel>
          <Button onPress={() => undefined}>Sensor hinzufügen</Button>
          <Button variant="secondary" onPress={() => undefined}>
            Jetzt aktualisieren
          </Button>
          <Button variant="ghost" onPress={() => undefined}>
            Später
          </Button>
          <Button onPress={() => undefined} disabled>
            Deaktiviert
          </Button>
        </Card>

        <ErrorNotice
          title="Verbindung fehlgeschlagen"
          message="Dein Sensor konnte gerade nicht erreicht werden. Prüfe dein WLAN."
          onRetry={() => undefined}
        />

        <Card>
          <EmptyState
            title="Noch keine Pflanzen"
            text="Füge deinen ersten Sensor hinzu, dann siehst du hier, wie es deinen Pflanzen geht."
            action={{ label: 'Sensor hinzufügen', onPress: () => undefined }}
          />
        </Card>
      </YStack>
    </Theme>
  )
}

export default function UiPreviewScreen() {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView>
        <Showcase scheme="dark" />
        <Showcase scheme="light" />
      </ScrollView>
    </SafeAreaView>
  )
}
