import { BleProvisioning } from './ble-provisioning'

// Übergang bis Phase B: der bewährte BLE-Kopplungs-Baustein als Schritt im neuen Ablauf.
export function legacyPairingStep(onPaired: (deviceId: string) => void) {
  return (
    <BleProvisioning
      onProvisioned={async (deviceId) => {
        onPaired(deviceId)
      }}
    />
  )
}
