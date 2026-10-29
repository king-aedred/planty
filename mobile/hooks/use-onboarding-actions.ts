import type { OnboardingResult } from '@/components/onboarding/onboarding-flow'
import { useMutation } from 'convex/react'
import { useCallback } from 'react'
import type { Id } from '../../convex/_generated/dataModel'
import { api } from '../../convex/_generated/api'

// Ergebnis eines Onboarding-Ablaufs in Convex anlegen: neue Pflanze (mit Sensor, Art, Persönlichkeit) oder
// Sensor einer bestehenden Pflanze zuordnen; im Onboarding zusätzlich die Kanäle speichern.
export function useOnboardingActions(clerkId: string) {
  const createPlant = useMutation(api.plants.createPlant)
  const assignSensorToPlant = useMutation(api.plants.assignSensorToPlant)
  const completeOnboarding = useMutation(api.users.completeOnboarding)

  const save = useCallback(
    async (result: OnboardingResult, options: { finishOnboarding?: boolean } = {}): Promise<string | null> => {
      try {
        if (result.assignedPlantId && result.deviceId) {
          await assignSensorToPlant({ plant_id: result.assignedPlantId as Id<'plants'>, device_id: result.deviceId })
        } else {
          await createPlant({
            clerk_id: clerkId,
            name: result.name,
            character: result.character,
            ...(result.deviceId ? { device_id: result.deviceId } : {}),
            ...(result.species ? { species_id: result.species.id } : {}),
          })
        }
        if (options.finishOnboarding) {
          await completeOnboarding({ channels: result.channels })
        }
        return null
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        if (message.includes('already registered')) return 'Dieser Sensor gehört schon zu einer anderen Pflanze.'
        if (message.includes('not owned')) return 'Dieser Sensor ist nicht in deinem Konto.'
        return 'Das hat nicht geklappt. Prüf deine Verbindung und versuch es noch mal.'
      }
    },
    [assignSensorToPlant, clerkId, completeOnboarding, createPlant],
  )

  const skipOnboarding = useCallback(() => completeOnboarding({}), [completeOnboarding])

  return { save, skipOnboarding }
}
