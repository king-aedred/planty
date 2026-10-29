import { MOCK_EMAIL } from '@/components/auth/preview-mock'
import { TermsSheet } from '@/components/legal/terms-sheet'
import { mockChannels } from '@/components/onboarding/channel-setup'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { mockPairing } from '@/components/onboarding/sensor-pairing'
import { PlantAvatar } from '@/components/plants/plant-avatar'
import type { DashboardPlant } from '@/components/plants/plant-dashboard'
import {
  type DemoSensor,
  demoHistory,
  demoMessagesFor,
  demoSensorFor,
  demoThresholds,
  searchDemoSpecies,
} from '@/components/screens/demo-data'
import { NotificationSettingsScreen } from '@/components/screens/notification-settings'
import { PlantDetailScreen } from '@/components/screens/plant-detail'
import { PlantSettingsScreen } from '@/components/screens/plant-settings'
import { ProfileScreen } from '@/components/screens/profile'
import { SensorDetailScreen } from '@/components/screens/sensor-detail'
import { type HeaderVariant, TabPage } from '@/components/screens/tab-page'
import { Badge } from '@/components/ui/badge'
import { BatteryIndicator } from '@/components/ui/battery-indicator'
import { Card } from '@/components/ui/card'
import { FadeIn } from '@/components/ui/fade-in'
import { ListRow } from '@/components/ui/list-row'
import { SectionLabel } from '@/components/ui/section-label'
import { TabBarView } from '@/components/ui/tab-bar'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { type Href, useLocalSearchParams, useRouter } from 'expo-router'
import { type ComponentProps, createContext, type ReactNode, useContext, useState } from 'react'
import { Text, useTheme, XStack, YStack } from 'tamagui'
import { AdaptiveDashboard, makePlants } from './6v4-adaptiv'

// Vorschau „Gesamtbild“: die App mit Tab-Leiste, allen vier Tabs und den Detailseiten (Beispieldaten).
// Ein kleiner Stapel ersetzt die echte Navigation: antippen legt eine Seite oben drauf, Zurück nimmt sie weg.

const TABS = ['plant-list', 'inbox', 'sensors', 'global-settings']

// Alle Beispielpflanzen, aus denen Nachrichten und Sensoren ihre Pflanze nachschlagen.
const ALL_PLANTS = makePlants(16)
const plantByName = (name: string) => ALL_PLANTS.find((plant) => plant.name === name) ?? ALL_PLANTS[0]
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

type Page =
  | { type: 'plant'; plant: DashboardPlant }
  | { type: 'plant-settings'; plant: DashboardPlant }
  | { type: 'sensor'; sensor: DemoSensor }
  | { type: 'profile' }
  | { type: 'notifications' }
  | { type: 'add-plant' }
  | { type: 'pair-sensor' }

// Kopf-Variante der Vorschau (?header=brand|glow|greeting), für alle Tabs gleich; brand ist Standard.
const HeaderVariantContext = createContext<HeaderVariant>('brand')

function TabScreen({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  const variant = useContext(HeaderVariantContext)
  return (
    <TabPage variant={variant} title={title} subtitle={subtitle} action={action}>
      {children}
    </TabPage>
  )
}

function RoundAction({ icon, label, onPress }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  const theme = useTheme()
  return (
    <YStack role="button" aria-label={label} onPress={onPress} width={40} height={40} borderRadius="$999" backgroundColor="$accent press:$accentPress" alignItems="center" justifyContent="center">
      <Ionicons name={icon} size={22} color={theme.textOnAccent?.val} />
    </YStack>
  )
}

// --- Nachrichten -----------------------------------------------------------------

const MESSAGES = [
  { id: 'm1', day: 'Heute', time: '11:58', plant: 'Cleo', mood: 'sad' as const, tone: 'critical' as const, text: 'Ich verdurste! 350 ml wären jetzt echt nett.', unread: true },
  { id: 'm2', day: 'Heute', time: '09:02', plant: 'Ben', mood: 'grumpy' as const, tone: 'warning' as const, text: 'Bald ein Schluck Wasser bitte. Ich sag’s nur.', unread: true },
  { id: 's1', day: 'Heute', time: '07:15', system: true, text: 'Der Akku von CALLGREEN-3F21C0 ist bei 18 %. Lade ihn bald per USB.' },
  { id: 'm3', day: 'Gestern', time: '18:30', plant: 'Monty', mood: 'happy' as const, tone: 'success' as const, text: 'Perfektes Licht heute! Danke, dass ich am Fenster stehen darf.' },
  { id: 'm4', day: 'Gestern', time: '08:00', plant: 'Pepe', mood: 'neutral' as const, tone: 'success' as const, text: 'Alles entspannt hier.' },
]

function InboxTab({ onOpenPlant, onOpenSensor }: { onOpenPlant: (plant: DashboardPlant) => void; onOpenSensor: (sensor: DemoSensor) => void }) {
  const theme = useTheme()
  const days = Array.from(new Set(MESSAGES.map((message) => message.day)))
  return (
    <TabScreen title="Nachrichten" subtitle="2 ungelesen">
      {days.map((day) => (
        <YStack key={day} gap="$8">
          <SectionLabel>{day}</SectionLabel>
          <Card dense>
            {MESSAGES.filter((message) => message.day === day).map((message, index) => (
              <XStack
                key={message.id}
                role="button"
                onPress={() => (message.system ? onOpenSensor(SENSORS[2]) : onOpenPlant(plantByName(message.plant!)))}
                gap="$12"
                padding="$12"
                borderTopWidth={index > 0 ? 1 : 0}
                borderColor="$border"
                alignItems="flex-start"
                backgroundColor="transparent press:$surfaceElevated"
              >
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

const SENSORS: DemoSensor[] = [
  { name: 'CALLGREEN-00A5D8', plantName: 'Monty', battery: 82, charging: false, rssi: -52, ssid: 'FRITZ!Box 7590 XY', firmware: '7.0.10', lastSeen: 'vor 4 Min.', nextMeasurement: '14:00', status: 'active' },
  { name: 'CALLGREEN-7B10E2', plantName: 'Cleo', battery: 64, charging: false, rssi: -61, ssid: 'FRITZ!Box 7590 XY', firmware: '7.0.10', lastSeen: 'vor 12 Min.', nextMeasurement: '14:00', status: 'active' },
  { name: 'CALLGREEN-3F21C0', plantName: 'Ben', battery: 18, charging: false, rssi: -74, ssid: 'FRITZ!Box 7590 XY', firmware: '7.0.10', lastSeen: 'vor 30 Min.', nextMeasurement: '14:00', status: 'low_battery' },
  { name: 'CALLGREEN-91D4A7', plantName: null, battery: 100, charging: false, rssi: -58, ssid: 'FRITZ!Box 7590 XY', firmware: '7.0.10', lastSeen: 'vor 3 Tagen', nextMeasurement: '–', status: 'free' },
]

const SENSOR_BADGE: Record<DemoSensor['status'], { tone: 'success' | 'warning' | 'neutral' | 'critical'; label: string }> = {
  active: { tone: 'success', label: 'Aktiv' },
  low_battery: { tone: 'warning', label: 'Akku schwach' },
  free: { tone: 'neutral', label: 'Frei' },
  offline: { tone: 'critical', label: 'Offline' },
}

function SensorsTab({ onOpenSensor, onPair }: { onOpenSensor: (sensor: DemoSensor) => void; onPair: () => void }) {
  const theme = useTheme()
  return (
    <TabScreen title="Sensoren" subtitle="3 im Einsatz · 1 frei" action={<RoundAction icon="add" label="Sensor koppeln" onPress={onPair} />}>
      <Card dense>
        {SENSORS.map((sensor, index) => {
          const badge = SENSOR_BADGE[sensor.status]
          const level = sensor.rssi >= -55 ? 4 : sensor.rssi >= -67 ? 3 : sensor.rssi >= -78 ? 2 : 1
          return (
            <XStack
              key={sensor.name}
              role="button"
              onPress={() => onOpenSensor(sensor)}
              gap="$12"
              padding="$12"
              alignItems="center"
              borderTopWidth={index > 0 ? 1 : 0}
              borderColor="$border"
              backgroundColor="transparent press:$surfaceElevated"
            >
              <YStack width={40} height={40} borderRadius="$12" backgroundColor="$surfaceElevated" alignItems="center" justifyContent="center">
                <Ionicons name="radio-outline" size={20} color={theme.accentText?.val} />
              </YStack>
              <YStack flex={1} gap="$4">
                <Text fontFamily="$body" fontWeight="600" fontSize={15} color="$textPrimary">
                  {sensor.plantName ?? 'Keiner Pflanze zugeordnet'}
                </Text>
                <XStack gap="$12" alignItems="center">
                  <BatteryIndicator percent={sensor.battery} />
                  <MaterialCommunityIcons name={`wifi-strength-${level}` as 'wifi-strength-1'} size={16} color={theme.textSecondary?.val} />
                  <Text fontFamily="$body" fontSize={12} color="$textSecondary">
                    {sensor.lastSeen}
                  </Text>
                </XStack>
              </YStack>
              <XStack>
                <Badge tone={badge.tone} label={badge.label} />
              </XStack>
              <Ionicons name="chevron-forward" size={16} color={theme.outlineVariant?.val} />
            </XStack>
          )
        })}
      </Card>
      <Text fontFamily="$body" fontSize={12} color="$textSecondary" textAlign="center">
        Tipp: Ein freier Sensor lässt sich einer Pflanze zuordnen.
      </Text>
    </TabScreen>
  )
}

// --- Einstellungen / Konto -------------------------------------------------------

function SettingsTab({ onOpen, onShowTerms, onSignOut }: { onOpen: (page: Page) => void; onShowTerms: () => void; onSignOut: () => void }) {
  const theme = useTheme()
  const icon = (name: ComponentProps<typeof Ionicons>['name']) => (
    <YStack width={32} height={32} borderRadius="$8" backgroundColor="$surfaceElevated" alignItems="center" justifyContent="center">
      <Ionicons name={name} size={17} color={theme.accentText?.val} />
    </YStack>
  )
  const notifications = () => onOpen({ type: 'notifications' })
  const profile = () => onOpen({ type: 'profile' })

  return (
    <TabScreen title="Einstellungen">
      <XStack
        role="button"
        onPress={profile}
        padding="$16"
        gap="$12"
        alignItems="center"
        borderRadius="$16"
        backgroundColor="$surface press:$surfaceElevated"
        borderWidth={1}
        borderColor="$border"
      >
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
            {MOCK_EMAIL}
          </Text>
        </YStack>
        <Ionicons name="chevron-forward" size={18} color={theme.outlineVariant?.val} />
      </XStack>

      <YStack gap="$8">
        <SectionLabel>Benachrichtigungen</SectionLabel>
        <Card dense>
          <ListRow leading={icon('notifications-outline')} title="Push" trailing={<Badge tone="success" label="An" />} onPress={notifications} />
          <ListRow divider leading={icon('paper-plane-outline')} title="Telegram" trailing={<Badge tone="success" label="Verbunden" />} onPress={notifications} />
          <ListRow divider leading={icon('call-outline')} title="Anruf" trailing={<Badge tone="neutral" label="Aus" />} onPress={notifications} />
          <ListRow divider leading={icon('moon-outline')} title="Ruhezeiten" subtitle="21 bis 8 Uhr" onPress={notifications} />
          <ListRow divider leading={icon('chatbubbles-outline')} title="Höchstens pro Tag" subtitle="3 Nachrichten je Pflanze" onPress={notifications} />
        </Card>
      </YStack>

      <YStack gap="$8">
        <SectionLabel>Konto</SectionLabel>
        <Card dense>
          <ListRow leading={icon('person-outline')} title="Profil" subtitle="Name, E-Mail, Telefonnummer" onPress={profile} />
          <ListRow divider leading={icon('key-outline')} title="Passwort ändern" onPress={profile} />
          <ListRow divider leading={icon('log-out-outline')} title="Abmelden" onPress={onSignOut} />
        </Card>
      </YStack>

      <YStack gap="$8">
        <SectionLabel>Über Callgreen</SectionLabel>
        <Card dense>
          <ListRow leading={icon('document-text-outline')} title="Nutzungsbedingungen" onPress={onShowTerms} />
          <ListRow divider leading={icon('shield-checkmark-outline')} title="Datenschutz" onPress={onShowTerms} />
          <ListRow divider leading={icon('help-buoy-outline')} title="Hilfe & Kontakt" onPress={() => undefined} />
        </Card>
      </YStack>

      <Text fontFamily="$body" fontSize={12} color="$textSecondary" textAlign="center">
        Callgreen 1.0 (Vorschau)
      </Text>
    </TabScreen>
  )
}

// --- Gesamtbild ------------------------------------------------------------------

export default function AppPreview() {
  const router = useRouter()
  const params = useLocalSearchParams<{ header?: string; plants?: string }>()
  // Anzahl Pflanzen fürs Gesamtbild (?plants=1|3|12|100), Standard 3.
  const plantCount = (['1', '3', '12', '100'] as const).find((value) => value === params.plants) ?? '3'
  const headerVariant: HeaderVariant = params.header === 'greeting' ? 'greeting' : params.header === 'glow' ? 'glow' : 'brand'
  const [tab, setTab] = useState('plant-list')
  const [stack, setStack] = useState<Page[]>([])
  const [isTermsOpen, setIsTermsOpen] = useState(false)
  const open = (page: Page) => setStack((current) => [...current, page])
  const back = () => setStack((current) => current.slice(0, -1))
  const backToTabs = () => setStack([])
  const openPlant = (plant: DashboardPlant) => open({ type: 'plant', plant })
  const openSensor = (sensor: DemoSensor) => open({ type: 'sensor', sensor })
  const freePlants = ALL_PLANTS.filter((plant) => plant.hasSensor === false).map((plant) => ({ id: plant.id, name: plant.name }))
  const top = stack[stack.length - 1]

  const renderPage = (page: Page) => {
    switch (page.type) {
      case 'plant': {
        const sensor = demoSensorFor(page.plant)
        return (
          <PlantDetailScreen
            plant={page.plant}
            sensor={sensor}
            messages={demoMessagesFor(page.plant)}
            history={(metric, range) => demoHistory(page.plant, metric, range)}
            moistureTarget={demoThresholds(page.plant).moisture}
            onBack={back}
            onOpenSettings={() => open({ type: 'plant-settings', plant: page.plant })}
            onOpenSensor={() => sensor && openSensor(sensor)}
            onPairSensor={() => open({ type: 'pair-sensor' })}
            ignoreReducedMotion
          />
        )
      }
      case 'plant-settings':
        return (
          <PlantSettingsScreen
            plant={page.plant}
            sensor={demoSensorFor(page.plant)}
            thresholds={demoThresholds(page.plant)}
            searchSpecies={searchDemoSpecies}
            onBack={back}
            onSave={back}
            onDelete={backToTabs}
            onPairSensor={() => open({ type: 'pair-sensor' })}
            onRemoveSensor={back}
            ignoreReducedMotion
          />
        )
      case 'sensor':
        return (
          <SensorDetailScreen
            sensor={page.sensor}
            onBack={back}
            onOpenPlant={page.sensor.plantName ? () => openPlant(plantByName(page.sensor.plantName!)) : undefined}
            onAssignPlant={() => open({ type: 'pair-sensor' })}
            onRemoved={back}
            runCommand={() => wait(2500)}
            ignoreReducedMotion
          />
        )
      case 'profile':
        return <ProfileScreen name="Hannes" email={MOCK_EMAIL} phone="" onBack={back} onSave={() => undefined} onDeleteAccount={() => router.replace('/preview/0-welcome' as Href)} ignoreReducedMotion />
      case 'notifications':
        return <NotificationSettingsScreen telegramConnected onBack={back} onConnectTelegram={() => undefined} ignoreReducedMotion />
      case 'add-plant':
        return <OnboardingFlow mode="add-plant" preview searchSpecies={searchDemoSpecies} homePath="" pairing={mockPairing} channelSetup={mockChannels} onExit={back} />
      case 'pair-sensor':
        return (
          <OnboardingFlow
            mode="pair-sensor"
            preview
            searchSpecies={searchDemoSpecies}
            homePath=""
            pairing={mockPairing}
            channelSetup={mockChannels}
            freePlants={freePlants}
            onExit={back}
          />
        )
    }
  }

  return (
    <HeaderVariantContext.Provider value={headerVariant}>
    <YStack flex={1} backgroundColor="$background">
      {top ? (
        <FadeIn key={`${stack.length}-${top.type}`} duration={300} offset={10} ignoreReducedMotion fill>
          {renderPage(top)}
        </FadeIn>
      ) : (
        <>
          {tab === 'plant-list' ? (
            <AdaptiveDashboard
              onOpenPlant={openPlant}
              onAdd={() => open({ type: 'add-plant' })}
              showCountSwitcher={false}
              initialCount={plantCount}
              renderPage={(header, content) => (
                <TabPage variant={headerVariant} title={header.title} subtitle={header.subtitle} action={header.action} greet>
                  {content}
                </TabPage>
              )}
            />
          ) : tab === 'inbox' ? (
            <InboxTab onOpenPlant={openPlant} onOpenSensor={openSensor} />
          ) : tab === 'sensors' ? (
            <SensorsTab onOpenSensor={openSensor} onPair={() => open({ type: 'pair-sensor' })} />
          ) : (
            <SettingsTab onOpen={open} onShowTerms={() => setIsTermsOpen(true)} onSignOut={() => router.replace('/preview/0-welcome' as Href)} />
          )}
          <TabBarView routes={TABS} active={tab} onSelect={setTab} dots={{ inbox: true }} />
        </>
      )}
      <TermsSheet visible={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
    </YStack>
    </HeaderVariantContext.Provider>
  )
}
