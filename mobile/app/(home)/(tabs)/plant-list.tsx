import { Achievements } from '@/components/plants/achievements'
import { AddPlantButton, AdaptiveDashboardContent, dashboardHeader } from '@/components/plants/adaptive-dashboard'
import { TabPage } from '@/components/screens/tab-page'
import { LoadingScreen } from '@/components/ui/loading-screen'
import { deviceOf, useGarden } from '@/hooks/use-garden'
import { useAchievements } from '@/hooks/use-achievements'
import { useRouter } from 'expo-router'

// Pflanzen (Tab): adaptives Dashboard mit echten Daten (Darstellung in components/plants/adaptive-dashboard.tsx).
export default function PlantListScreen() {
  const router = useRouter()
  const garden = useGarden()
  const onlyPlant = garden.plants?.length === 1 ? garden.plants[0] : null
  const achievements = useAchievements(onlyPlant, onlyPlant ? deviceOf(onlyPlant) : null, garden.plants?.length ?? 0)

  if (garden.isLoading) {
    return <LoadingScreen />
  }

  const header = dashboardHeader(garden.dashboardPlants)
  const addPlant = () => router.push('/(home)/add-plant')

  return (
    <TabPage variant="brand" title={header.title} subtitle={header.subtitle} action={<AddPlantButton onPress={addPlant} />} greet userName={garden.user?.username ?? ''}>
      <AdaptiveDashboardContent
        plants={garden.dashboardPlants}
        onOpenPlant={(plant) => router.push({ pathname: '/(home)/status', params: { plant_id: plant.id } })}
        achievements={achievements ? <Achievements stats={achievements.stats} badges={achievements.badges} /> : undefined}
        onAddPlant={addPlant}
        onPairSensor={() => router.push('/(home)/add-sensor')}
      />
    </TabPage>
  )
}
