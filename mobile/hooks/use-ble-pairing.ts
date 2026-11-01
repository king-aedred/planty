import { createBlePairing } from '@/components/onboarding/ble-pairing'
import type { PairingAdapter } from '@/components/onboarding/sensor-pairing'
import { useAction, useConvex } from 'convex/react'
import { useMemo } from 'react'
import { api } from '../../convex/_generated/api'

// Echte Sensor-Kopplung per BLE: Claim-Token aus Convex, Backend meldet live, wenn der Claim durch ist.
export function useBlePairing(): PairingAdapter {
  const convex = useConvex()
  const createClaimToken = useAction(api.devices.createClaimToken)

  const pairing = useMemo<PairingAdapter>(
    () =>
      createBlePairing({
        createClaimToken: () => createClaimToken({}),
        watchClaim: (claimId, onClaimed) => {
          const watch = convex.watchQuery(api.devices.getClaimStatus, { claim_id: claimId as never })
          const check = () => {
            const result = watch.localQueryResult()
            if (result?.status === 'claimed') onClaimed(result.device_id)
          }
          check()
          return watch.onUpdate(check)
        },
      }),
    [convex, createClaimToken],
  )
  // Trennen beim Verlassen übernimmt der Ablauf (pairing.close).
  return pairing
}
