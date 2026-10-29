import { MOCK_HOME } from '@/components/auth/preview-mock'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { mockChannels } from '@/components/onboarding/channel-setup'
import { mockPairing } from '@/components/onboarding/sensor-pairing'
import { searchDemoSpecies } from '@/components/screens/demo-data'

// Vorschau Screen 4 (docs/SCREENS.md): Onboarding, simuliert. Sensor-Kopplung simuliert (WLAN-Passwort 12345678).
export default function OnboardingPreview() {
  return <OnboardingFlow preview searchSpecies={searchDemoSpecies} homePath={MOCK_HOME} pairing={mockPairing} channelSetup={mockChannels} />
}
