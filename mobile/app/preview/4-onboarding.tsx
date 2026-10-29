import { MOCK_HOME } from '@/components/auth/preview-mock'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { mockChannels } from '@/components/onboarding/channel-setup'
import { mockPairing } from '@/components/onboarding/sensor-pairing'
import type { Species } from '@/components/plants/species-picker'

// Beispielarten für die Vorschau (echt: Convex plant_species).
const DEMO_SPECIES: Species[] = [
  { id: 'monstera', common_name: 'Monstera', name: 'Monstera deliciosa' },
  { id: 'calathea', common_name: 'Calathea', name: 'Calathea orbifolia' },
  { id: 'ficus', common_name: 'Birkenfeige', name: 'Ficus benjamina' },
  { id: 'pilea', common_name: 'Ufopflanze', name: 'Pilea peperomioides' },
  { id: 'sansevieria', common_name: 'Bogenhanf', name: 'Sansevieria trifasciata' },
  { id: 'efeutute', common_name: 'Efeutute', name: 'Epipremnum aureum' },
]

function searchDemoSpecies(search: string) {
  const query = search.trim().toLowerCase()
  if (!query) {
    return []
  }
  return DEMO_SPECIES.filter((entry) => entry.common_name.toLowerCase().includes(query) || entry.name.toLowerCase().includes(query))
}

// Vorschau Screen 4 (docs/SCREENS.md): Onboarding, simuliert. Sensor-Kopplung simuliert (WLAN-Passwort 12345678).
export default function OnboardingPreview() {
  return <OnboardingFlow preview searchSpecies={searchDemoSpecies} homePath={MOCK_HOME} pairing={mockPairing} channelSetup={mockChannels} />
}
