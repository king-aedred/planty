import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { YStack } from 'tamagui'
import { type DashboardPlant, PlantDashboard } from '../components/plants/plant-dashboard'

// Vorschau des Dashboards mit den Beispieldaten aus dem Stitch-Template. Nicht verlinkt; /dashboard-preview.
const DEMO_PLANTS: DashboardPlant[] = [
  {
    id: 'monty',
    name: "Monstera 'Monty'",
    character: 'happy',
    speciesName: 'Monstera deliciosa',
    quote: "Mir geht's blendend, danke!",
    summary: { moisture_median: 54, temperature_median: 21.8, light_level_median: 1820, moisture_state: 'ok', temperature_state: 'ok', light_state: 'ok' },
  },
  {
    id: 'cleo',
    name: "Calathea 'Cleo'",
    character: 'grumpy',
    speciesName: 'Calathea orbifolia',
    quote: 'Bald ein Schluck Wasser bitte.',
    summary: { moisture_median: 21, temperature_median: 19.4, light_level_median: 940, moisture_state: 'warning', temperature_state: 'ok', light_state: 'ok' },
  },
  {
    id: 'ben',
    name: "Ficus 'Ben'",
    character: 'neutral',
    speciesName: 'Ficus benjamina',
    quote: 'Ich verdurste! 350ml nötig.',
    summary: { moisture_median: 11, temperature_median: 24.1, light_level_median: 2450, moisture_state: 'critical', temperature_state: 'ok', light_state: 'ok' },
  },
  {
    id: 'pepe',
    name: "Pilea 'Pepe'",
    character: 'neutral',
    speciesName: 'Pilea peperomioides',
    quote: 'Perfektes Licht heute!',
    summary: { moisture_median: 48, temperature_median: 22, light_level_median: 1450, moisture_state: 'ok', temperature_state: 'ok', light_state: 'ok' },
  },
]

export default function DashboardPreviewScreen() {
  const noop = () => undefined
  return (
    <YStack flex={1} backgroundColor="$background">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <PlantDashboard
            plants={DEMO_PLANTS}
            activeSensors={4}
            totalSensors={4}
            unreadCount={2}
            onOpenPlant={noop}
            onAddPlant={noop}
            onPairSensor={noop}
            onOpenInbox={noop}
            onOpenProfile={noop}
            ignoreReducedMotion
          />
        </ScrollView>
      </SafeAreaView>
    </YStack>
  )
}
