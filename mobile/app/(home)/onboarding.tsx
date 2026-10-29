import { legacyPairingStep } from '@/components/onboarding/legacy-pairing'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { mockPairing } from '@/components/onboarding/sensor-pairing'
import { LoadingScreen } from '@/components/ui/loading-screen'
import { useChannelAdapter } from '@/hooks/use-channel-adapter'
import { useGarden } from '@/hooks/use-garden'
import { useOnboardingActions } from '@/hooks/use-onboarding-actions'
import { useSpeciesSearch } from '@/hooks/use-species-search'

// Onboarding nach der ersten Anmeldung (Screen 4). Sensor-Kopplung bis Phase B über den bestehenden BLE-Baustein.
export default function OnboardingScreen() {
  const garden = useGarden()
  const channels = useChannelAdapter(garden.clerkId, garden.appUser)
  const actions = useOnboardingActions(garden.clerkId)

  if (!garden.clerkId) {
    return <LoadingScreen />
  }

  return (
    <OnboardingFlow
      mode="onboarding"
      useSpeciesSearch={useSpeciesSearch}
      homePath="/(home)/(tabs)/plant-list"
      // pairing wird mit legacyPairing nicht benutzt.
      pairing={mockPairing}
      legacyPairing={legacyPairingStep}
      channelSetup={channels}
      onComplete={(result) => actions.save(result, { finishOnboarding: true })}
      onSkip={() => void actions.skipOnboarding()}
    />
  )
}
