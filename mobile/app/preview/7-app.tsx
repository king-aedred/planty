import { PlantAvatar } from '@/components/plants/plant-avatar'
import { Badge } from '@/components/ui/badge'
import { BatteryIndicator } from '@/components/ui/battery-indicator'
import { Card } from '@/components/ui/card'
import { FadeIn } from '@/components/ui/fade-in'
import { ListRow } from '@/components/ui/list-row'
import { SectionLabel } from '@/components/ui/section-label'
import { TAB_BAR_SPACE, TabBarView } from '@/components/ui/tab-bar'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { type ComponentProps, type ReactNode, useState } from 'react'
import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, useTheme, XStack, YStack } from 'tamagui'
import { AdaptiveDashboard } from './6v4-adaptiv'

// Vorschau „Gesamtbild“: die App mit Tab-Leiste und allen vier Tabs (Beispieldaten), damit Dashboard,
// Navigation und Konto zusammen beurteilt werden können. Pflanzen = adaptives Dashboard (6v4).

const TABS = ['plant-list', 'inbox', 'sensors', 'global-settings']

function TabScreen({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <YStack flex={1} backgroundColor="$background">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 16 + TAB_BAR_SPACE, gap: 18 }}>
          <FadeIn duration={350} offset={8} ignoreReducedMotion>
            <XStack justifyContent="space-between" alignItems="center">
              <YStack>
                <Text fontFamily="$heading" fontSize={30} color="$textPrimary">
                  {title}
                </Text>
                {subtitle ? (
                  <Text fontFamily="$body" fontSize={13} color="$textSecondary">
                    {subtitle}
                  </Text>
                ) : null}
              </YStack>
              {action}
            </XStack>
          </FadeIn>
          <FadeIn delay={80} duration={400} ignoreReducedMotion>
            <YStack gap="$16">{children}</YStack>
          </FadeIn>
        </ScrollView>
      </SafeAreaView>
    </YStack>
  )
}

function RoundAction({ icon }: { icon: ComponentProps<typeof Ionicons>['name'] }) {
  const theme = useTheme()
  return (
    <YStack width={40} height={40} borderRadius="$999" backgroundColor="$accent" alignItems="center" justifyContent="center">
      <Ionicons name={icon} size={22} color={theme.textOnAccent?.val} />
    </YStack>
  )
}

// --- Nachrichten -----------------------------------------------------------------

const MESSAGES = [
  { id: 'm1', day: 'Heute', time: '11:58', plant: 'Ben', mood: 'sad' as const, tone: 'critical' as const, text: 'Ich verdurste! 350 ml wären jetzt echt nett.', unread: true },
  { id: 'm2', day: 'Heute', time: '09:02', plant: 'Cleo', mood: 'grumpy' as const, tone: 'warning' as const, text: 'Bald ein Schluck Wasser bitte. Ich sag’s nur.', unread: true },
  { id: 's1', day: 'Heute', time: '07:15', system: true, text: 'Der Akku von CALLGREEN-3F21C0 ist bei 18 %. Lade ihn bald per USB.' },
  { id: 'm3', day: 'Gestern', time: '18:30', plant: 'Monty', mood: 'happy' as const, tone: 'success' as const, text: 'Perfektes Licht heute! Danke, dass ich am Fenster stehen darf.' },
  { id: 'm4', day: 'Gestern', time: '08:00', plant: 'Pepe', mood: 'neutral' as const, tone: 'success' as const, text: 'Alles entspannt hier.' },
]

function InboxTab() {
  const theme = useTheme()
  const days = Array.from(new Set(MESSAGES.map((message) => message.day)))
  return (
    <TabScreen title="Nachrichten" subtitle="2 ungelesen">
      {days.map((day) => (
        <YStack key={day} gap="$8">
          <SectionLabel>{day}</SectionLabel>
          <Card dense>
            {MESSAGES.filter((message) => message.day === day).map((message, index) => (
              <XStack key={message.id} gap="$12" padding="$12" borderTopWidth={index > 0 ? 1 : 0} borderColor="$border" alignItems="flex-start">
                {message.system ? (
                  <YStack width={40} height={40} borderRadius="$999" backgroundColor="$warningSoft" alignItems="center" justifyContent="center">
                    <Ionicons name="battery-dead-outline" size={20} color={theme.warning?.val} />
                  </YStack>
                ) : (
                  <PlantAvatar mood={message.mood!} status={message.tone!} size={40} />
                )}
                <YStack flex={1} gap="$2">
                  <XStack justifyContent="space-between" alignItems="baseline">
                    <Text fontFamily="$body" fontWeight="700" fontSize={14} color="$textPrimary">
                      {message.system ? 'Callgreen' : message.plant}
                    </Text>
                    <Text fontFamily="$body" fontSize={11} color="$textSecondary">
                      {message.time}
                    </Text>
                  </XStack>
                  <Text fontFamily="$body" fontSize={14} lineHeight="$4" color={message.unread ? '$textPrimary' : '$textSecondary'}>
                    {message.text}
                  </Text>
                </YStack>
                {message.unread ? <YStack width={8} height={8} marginTop={6} borderRadius="$999" backgroundColor="$accentText" /> : null}
              </XStack>
            ))}
          </Card>
        </YStack>
      ))}
    </TabScreen>
  )
}

// --- Sensoren --------------------------------------------------------------------

const SENSORS = [
  { id: 'CALLGREEN-00A5D8', plant: 'Monty', battery: 82, rssi: 3, seen: 'vor 4 Min.', tone: 'success' as const, label: 'Aktiv' },
  { id: 'CALLGREEN-7B10E2', plant: 'Cleo', battery: 64, rssi: 4, seen: 'vor 12 Min.', tone: 'success' as const, label: 'Aktiv' },
  { id: 'CALLGREEN-3F21C0', plant: 'Ben', battery: 18, rssi: 2, seen: 'vor 30 Min.', tone: 'warning' as const, label: 'Akku schwach' },
  { id: 'CALLGREEN-91D4A7', plant: null, battery: 100, rssi: 0, seen: 'vor 3 Tagen', tone: 'neutral' as const, label: 'Frei' },
]

function SensorsTab() {
  const theme = useTheme()
  return (
    <TabScreen title="Sensoren" subtitle="3 im Einsatz · 1 frei" action={<RoundAction icon="add" />}>
      <Card dense>
        {SENSORS.map((sensor, index) => (
          <XStack key={sensor.id} gap="$12" padding="$12" alignItems="center" borderTopWidth={index > 0 ? 1 : 0} borderColor="$border">
            <YStack width={40} height={40} borderRadius="$12" backgroundColor="$surfaceElevated" alignItems="center" justifyContent="center">
              <Ionicons name="radio-outline" size={20} color={theme.accentText?.val} />
            </YStack>
            <YStack flex={1} gap="$4">
              <Text fontFamily="$body" fontWeight="600" fontSize={15} color="$textPrimary">
                {sensor.plant ?? 'Keiner Pflanze zugeordnet'}
              </Text>
              <XStack gap="$12" alignItems="center">
                <BatteryIndicator percent={sensor.battery} />
                {sensor.rssi > 0 ? (
                  <MaterialCommunityIcons name={`wifi-strength-${sensor.rssi}` as 'wifi-strength-1'} size={16} color={theme.textSecondary?.val} />
                ) : null}
                <Text fontFamily="$body" fontSize={12} color="$textSecondary">
                  {sensor.seen}
                </Text>
              </XStack>
            </YStack>
            <Badge tone={sensor.tone} label={sensor.label} />
            <Ionicons name="chevron-forward" size={16} color={theme.outlineVariant?.val} />
          </XStack>
        ))}
      </Card>
      <Text fontFamily="$body" fontSize={12} color="$textSecondary" textAlign="center">
        Tipp: Ein freier Sensor lässt sich einer Pflanze zuordnen.
      </Text>
    </TabScreen>
  )
}

// --- Einstellungen / Konto -------------------------------------------------------

function SettingsTab() {
  const theme = useTheme()
  const icon = (name: ComponentProps<typeof Ionicons>['name']) => (
    <YStack width={32} height={32} borderRadius="$8" backgroundColor="$surfaceElevated" alignItems="center" justifyContent="center">
      <Ionicons name={name} size={17} color={theme.accentText?.val} />
    </YStack>
  )
  const noop = () => undefined

  return (
    <TabScreen title="Einstellungen">
      <XStack padding="$16" gap="$12" alignItems="center" borderRadius="$16" backgroundColor="$surface" borderWidth={1} borderColor="$border">
        <YStack width={56} height={56} borderRadius="$999" backgroundColor="$accent" alignItems="center" justifyContent="center">
          <Text fontFamily="$heading" fontSize={24} color="$textOnAccent">
            H
          </Text>
        </YStack>
        <YStack flex={1}>
          <Text fontFamily="$body" fontWeight="700" fontSize={17} color="$textPrimary">
            Hannes
          </Text>
          <Text fontFamily="$body" fontSize={13} color="$textSecondary">
            test@test.test
          </Text>
        </YStack>
        <Ionicons name="chevron-forward" size={18} color={theme.outlineVariant?.val} />
      </XStack>

      <YStack gap="$8">
        <SectionLabel>Benachrichtigungen</SectionLabel>
        <Card dense>
          <ListRow leading={icon('notifications-outline')} title="Push" trailing={<Badge tone="success" label="An" />} onPress={noop} />
          <ListRow divider leading={icon('paper-plane-outline')} title="Telegram" trailing={<Badge tone="success" label="Verbunden" />} onPress={noop} />
          <ListRow divider leading={icon('call-outline')} title="Anruf" trailing={<Badge tone="neutral" label="Aus" />} onPress={noop} />
          <ListRow divider leading={icon('moon-outline')} title="Ruhezeiten" subtitle="21 bis 8 Uhr" onPress={noop} />
          <ListRow divider leading={icon('chatbubbles-outline')} title="Höchstens pro Tag" subtitle="3 Nachrichten je Pflanze" onPress={noop} />
        </Card>
      </YStack>

      <YStack gap="$8">
        <SectionLabel>Konto</SectionLabel>
        <Card dense>
          <ListRow leading={icon('person-outline')} title="Profil" subtitle="Name, E-Mail, Telefonnummer" onPress={noop} />
          <ListRow divider leading={icon('key-outline')} title="Passwort ändern" onPress={noop} />
          <ListRow divider leading={icon('log-out-outline')} title="Abmelden" onPress={noop} />
        </Card>
      </YStack>

      <YStack gap="$8">
        <SectionLabel>Über Callgreen</SectionLabel>
        <Card dense>
          <ListRow leading={icon('document-text-outline')} title="Nutzungsbedingungen" onPress={noop} />
          <ListRow divider leading={icon('shield-checkmark-outline')} title="Datenschutz" onPress={noop} />
          <ListRow divider leading={icon('help-buoy-outline')} title="Hilfe & Kontakt" onPress={noop} />
        </Card>
      </YStack>

      <Text fontFamily="$body" fontSize={12} color="$textSecondary" textAlign="center">
        Callgreen 1.0 (Vorschau)
      </Text>
    </TabScreen>
  )
}

export default function AppPreview() {
  const [tab, setTab] = useState('plant-list')
  return (
    <YStack flex={1} backgroundColor="$background">
      {tab === 'plant-list' ? (
        <AdaptiveDashboard showBell={false} bottomSpace={TAB_BAR_SPACE} />
      ) : tab === 'inbox' ? (
        <InboxTab />
      ) : tab === 'sensors' ? (
        <SensorsTab />
      ) : (
        <SettingsTab />
      )}
      <TabBarView routes={TABS} active={tab} onSelect={setTab} dots={{ inbox: true }} />
    </YStack>
  )
}
