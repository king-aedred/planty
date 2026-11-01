import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { LoadingScreen } from '@/components/ui/loading-screen'
import { useChannelAdapter } from '@/hooks/use-channel-adapter'
import { useBlePairing } from '@/hooks/use-ble-pairing'
import { useGarden } from '@/hooks/use-garden'
import { useOnboardingActions } from '@/hooks/use-onboarding-actions'
import { useSpeciesSearch } from '@/hooks/use-species-search'

// Onboarding nach der ersten Anmeldung (Screen 4). Sensor-Kopplung echt über BLE.
export default function OnboardingScreen() {
  const garden = useGarden()
  const pairing = useBlePairing()
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
      pairing={pairing}
      channelSetup={channels}
      onComplete={(result) => actions.save(result, { finishOnboarding: true })}
      onSkip={() => void actions.skipOnboarding()}
    />
  )
}
