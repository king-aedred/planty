import { legacyPairingStep } from '@/components/onboarding/legacy-pairing'
import { mockChannels } from '@/components/onboarding/channel-setup'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { mockPairing } from '@/components/onboarding/sensor-pairing'
import { LoadingScreen } from '@/components/ui/loading-screen'
import { useGarden } from '@/hooks/use-garden'
import { useOnboardingActions } from '@/hooks/use-onboarding-actions'
import { useSpeciesSearch } from '@/hooks/use-species-search'
import { useLocalSearchParams, useRouter } from 'expo-router'

// Pflanze hinzufügen (Screen 9): Ablauf aus dem Onboarding ohne Kanäle. Mit ?device_id= ist der Sensor
// schon gekoppelt (aus dem Sensor-Detail) und die Sensor-Schritte entfallen.
export default function AddPlantScreen() {
  const router = useRouter()
  const { device_id: presetDeviceId } = useLocalSearchParams<{ device_id?: string }>()
  const garden = useGarden()
  const actions = useOnboardingActions(garden.clerkId)

  if (!garden.clerkId) {
    return <LoadingScreen />
  }

  return (
    <OnboardingFlow
      mode="add-plant"
      useSpeciesSearch={useSpeciesSearch}
      homePath="/(home)/(tabs)/plant-list"
      pairing={mockPairing}
      legacyPairing={legacyPairingStep}
      // Kanäle kommen in diesem Ablauf nicht vor.
      channelSetup={mockChannels}
      presetDeviceId={presetDeviceId || undefined}
      onComplete={(result) => actions.save(result)}
      onExit={() => router.back()}
    />
  )
}
