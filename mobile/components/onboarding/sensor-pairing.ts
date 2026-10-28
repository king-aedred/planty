// Schnittstelle zwischen den Kopplungs-Schritten (Oberfläche) und der Technik dahinter.
// Vorschau: mockPairing (simuliert). Echt: BLE-Provisioning (wird in Etappe 4 angebunden).

export type WifiNetwork = { ssid: string; rssi: number; secure: boolean }

export type ConnectStage = 'wifi' | 'claim' | 'done'
export type ConnectFailure = 'auth_failed' | 'not_found' | 'timeout' | 'other'
export type ConnectResult = { ok: true; deviceId: string } | { ok: false; reason: ConnectFailure }

export type PairingAdapter = {
  // Sucht per Bluetooth nach einem Sensor; null = nichts gefunden.
  scan: () => Promise<{ deviceName: string; deviceId: string } | null>
  // WLANs, die der Sensor selbst sieht (stärkstes zuerst).
  listNetworks: () => Promise<WifiNetwork[]>
  // Zugangsdaten senden, auf WLAN und Anmeldung bei Callgreen warten. onStage meldet den Fortschritt.
  connect: (ssid: string, password: string, onStage: (stage: ConnectStage) => void) => Promise<ConnectResult>
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// Testdaten der Vorschau: jedes WLAN der Liste klappt mit diesem Passwort, alles andere gilt als falsch.
export const MOCK_WIFI_PASSWORD = '12345678'

export const mockPairing: PairingAdapter = {
  scan: async () => {
    await wait(2600)
    return { deviceName: 'CALLGREEN-00A5D8', deviceId: 'cg-00A5D8' }
  },
  listNetworks: async () => {
    await wait(900)
    return [
      { ssid: 'FRITZ!Box 7590 XY', rssi: -48, secure: true },
      { ssid: 'Hannes', rssi: -63, secure: true },
      { ssid: 'Vodafone-Gast', rssi: -74, secure: false },
      { ssid: 'Nachbar_5G', rssi: -86, secure: true },
    ]
  },
  connect: async (ssid, password, onStage) => {
    await wait(1200)
    if (ssid !== 'Vodafone-Gast' && password !== MOCK_WIFI_PASSWORD) {
      return { ok: false, reason: 'auth_failed' }
    }
    onStage('wifi')
    await wait(1100)
    onStage('claim')
    await wait(900)
    onStage('done')
    return { ok: true, deviceId: 'cg-00A5D8' }
  },
}

// Signalstärke grob in 1–4 Balken.
export function signalBars(rssi: number) {
  if (rssi >= -55) return 4
  if (rssi >= -67) return 3
  if (rssi >= -78) return 2
  return 1
}
