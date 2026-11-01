import { mockChannels } from '@/components/onboarding/channel-setup'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { LoadingScreen } from '@/components/ui/loading-screen'
import { useBlePairing } from '@/hooks/use-ble-pairing'
import { deviceOf, useGarden } from '@/hooks/use-garden'
import { useOnboardingActions } from '@/hooks/use-onboarding-actions'
import { useSpeciesSearch } from '@/hooks/use-species-search'
import { useRouter } from 'expo-router'

// Sensor koppeln (Screen 5): koppeln, dann einer Pflanze ohne Sensor zuordnen oder eine neue anlegen.
export default function AddSensorScreen() {
  const router = useRouter()
  const garden = useGarden()
  const pairing = useBlePairing()
  const actions = useOnboardingActions(garden.clerkId)

  if (!garden.clerkId || garden.isLoading) {
    return <LoadingScreen />
  }

  const freePlants = (garden.plants ?? []).filter((plant) => !deviceOf(plant)).map((plant) => ({ id: String(plant._id), name: plant.name }))

  return (
    <OnboardingFlow
      mode="pair-sensor"
      useSpeciesSearch={useSpeciesSearch}
      homePath="/(home)/(tabs)/sensors"
      pairing={pairing}
      channelSetup={mockChannels}
      freePlants={freePlants}
      onComplete={(result) => actions.save(result)}
      onExit={() => router.back()}
    />
  )
}
