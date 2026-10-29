import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { YStack } from 'tamagui'
import { DEMO_PLANTS } from '@/components/plants/dashboard-demo'
import { type DashboardPlant, PlantDashboard } from '@/components/plants/plant-dashboard'

// Vorschau Screen 6 (docs/SCREENS.md): Dashboard mit Beispieldaten (alles gut, Achtung, kritisch, ohne Sensor).
type DashboardPreviewProps = { plants: DashboardPlant[] }

export function DashboardPreview({ plants }: DashboardPreviewProps) {
  const noop = () => undefined
  const withSensor = plants.filter((plant) => plant.hasSensor !== false).length
  return (
    <YStack flex={1} backgroundColor="$background">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <PlantDashboard
            plants={plants}
            activeSensors={withSensor}
            totalSensors={withSensor}
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

export default function DashboardPreviewScreen() {
  return <DashboardPreview plants={DEMO_PLANTS} />
}
