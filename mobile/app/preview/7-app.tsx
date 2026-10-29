import { MOCK_EMAIL } from '@/components/auth/preview-mock'
import { TermsSheet } from '@/components/legal/terms-sheet'
import { mockChannels } from '@/components/onboarding/channel-setup'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { mockPairing } from '@/components/onboarding/sensor-pairing'
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
import { InboxList, type InboxItem } from '@/components/screens/inbox-list'
import { SensorDetailScreen } from '@/components/screens/sensor-detail'
import { SensorList } from '@/components/screens/sensor-list'
import { SettingsOverview } from '@/components/screens/settings-overview'
import { type HeaderVariant, TabPage } from '@/components/screens/tab-page'
import { FadeIn } from '@/components/ui/fade-in'
import { TabBarView } from '@/components/ui/tab-bar'
import { Ionicons } from '@expo/vector-icons'
import { type Href, useLocalSearchParams, useRouter } from 'expo-router'
import { type ComponentProps, createContext, type ReactNode, useContext, useState } from 'react'
import { useTheme, YStack } from 'tamagui'
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

const MESSAGES: InboxItem[] = [
  { id: 'm1', day: 'Heute', time: '11:58', title: 'Cleo', avatar: { mood: 'sad', tone: 'critical' }, text: 'Ich verdurste! 350 ml wären jetzt echt nett.', unread: true },
  { id: 'm2', day: 'Heute', time: '09:02', title: 'Ben', avatar: { mood: 'grumpy', tone: 'warning' }, text: 'Bald ein Schluck Wasser bitte. Ich sag’s nur.', unread: true },
  { id: 's1', day: 'Heute', time: '07:15', title: 'Callgreen', avatar: null, text: 'Der Akku von CALLGREEN-3F21C0 ist bei 18 %. Lade ihn bald per USB.', unread: false },
  { id: 'm3', day: 'Gestern', time: '18:30', title: 'Monty', avatar: { mood: 'happy', tone: 'success' }, text: 'Perfektes Licht heute! Danke, dass ich am Fenster stehen darf.', unread: false },
  { id: 'm4', day: 'Gestern', time: '08:00', title: 'Pepe', avatar: { mood: 'neutral', tone: 'success' }, text: 'Alles entspannt hier.', unread: false },
]

// --- Sensoren --------------------------------------------------------------------

const SENSORS: DemoSensor[] = [
  { name: 'CALLGREEN-00A5D8', plantName: 'Monty', battery: 82, charging: false, rssi: -52, ssid: 'FRITZ!Box 7590 XY', firmware: '7.0.10', lastSeen: 'vor 4 Min.', nextMeasurement: '14:00', status: 'active' },
  { name: 'CALLGREEN-7B10E2', plantName: 'Cleo', battery: 64, charging: false, rssi: -61, ssid: 'FRITZ!Box 7590 XY', firmware: '7.0.10', lastSeen: 'vor 12 Min.', nextMeasurement: '14:00', status: 'active' },
  { name: 'CALLGREEN-3F21C0', plantName: 'Ben', battery: 18, charging: false, rssi: -74, ssid: 'FRITZ!Box 7590 XY', firmware: '7.0.10', lastSeen: 'vor 30 Min.', nextMeasurement: '14:00', status: 'low_battery' },
  { name: 'CALLGREEN-91D4A7', plantName: null, battery: 100, charging: false, rssi: -58, ssid: 'FRITZ!Box 7590 XY', firmware: '7.0.10', lastSeen: 'vor 3 Tagen', nextMeasurement: '–', status: 'free' },
]

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
            useSpeciesSearch={searchDemoSpecies}
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
            onRemove={() => undefined}
            runCommand={() => wait(2500).then(() => ({ kind: 'ok' as const }))}
            ignoreReducedMotion
          />
        )
      case 'profile':
        return <ProfileScreen name="Hannes" email={MOCK_EMAIL} phone="" onBack={back} onSave={() => undefined} onDeleteAccount={() => router.replace('/preview/0-welcome' as Href)} ignoreReducedMotion />
      case 'notifications':
        return (
          <NotificationSettingsScreen
            initial={{ push: true, call: false, maxPerDay: 3, windowFrom: 8, windowTo: 21 }}
            telegramConnected
            onBack={back}
            onConnectTelegram={() => undefined}
            ignoreReducedMotion
          />
        )
      case 'add-plant':
        return <OnboardingFlow mode="add-plant" preview useSpeciesSearch={searchDemoSpecies} homePath="" pairing={mockPairing} channelSetup={mockChannels} onExit={back} />
      case 'pair-sensor':
        return (
          <OnboardingFlow
            mode="pair-sensor"
            preview
            useSpeciesSearch={searchDemoSpecies}
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
            <TabScreen title="Nachrichten" subtitle="2 ungelesen">
              <InboxList items={MESSAGES} onOpen={(item) => (item.avatar ? openPlant(plantByName(item.title)) : openSensor(SENSORS[2]))} />
            </TabScreen>
          ) : tab === 'sensors' ? (
            <TabScreen title="Sensoren" subtitle="3 im Einsatz · 1 frei" action={<RoundAction icon="add" label="Sensor koppeln" onPress={() => open({ type: 'pair-sensor' })} />}>
              <SensorList sensors={SENSORS} onOpen={openSensor} onPair={() => open({ type: 'pair-sensor' })} />
            </TabScreen>
          ) : (
            <TabScreen title="Einstellungen">
              <SettingsOverview
                userName="Hannes"
                email={MOCK_EMAIL}
                push
                telegramConnected
                call={false}
                windowText="8 bis 21 Uhr"
                maxPerDayText="3 Nachrichten je Pflanze"
                version="1.0 (Vorschau)"
                onOpenProfile={() => open({ type: 'profile' })}
                onOpenNotifications={() => open({ type: 'notifications' })}
                onShowTerms={() => setIsTermsOpen(true)}
                onSignOut={() => router.replace('/preview/0-welcome' as Href)}
              />
            </TabScreen>
          )}
          <TabBarView routes={TABS} active={tab} onSelect={setTab} dots={{ inbox: true }} />
        </>
      )}
      <TermsSheet visible={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
    </YStack>
    </HeaderVariantContext.Provider>
  )
}
