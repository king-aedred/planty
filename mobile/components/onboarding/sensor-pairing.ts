// Schnittstelle zwischen den Kopplungs-Schritten (Oberfläche) und der Technik dahinter.
// Vorschau: mockPairing (simuliert). Echt: createBlePairing in ble-pairing.ts (ESP-IDF Provisioning über BLE).

export type WifiNetwork = { ssid: string; rssi: number; secure: boolean }

export type ConnectStage = 'wifi' | 'claim' | 'done'
export type ConnectFailure = 'auth_failed' | 'not_found' | 'timeout' | 'other'
// message: konkreter Text vom Gerät bzw. Backend (z. B. Claim abgelaufen); sonst Standardtext je reason.
export type ConnectResult = { ok: true; deviceId: string } | { ok: false; reason: ConnectFailure; message?: string }

export type FoundDevice = { deviceName: string; deviceId: string }
export type StepResult = { ok: true } | { ok: false; message: string }

export type PairingAdapter = {
  // Voraussetzungen prüfen und Berechtigungen holen (Bluetooth, Standort auf Android).
  prepare: () => Promise<StepResult>
  // Sucht per Bluetooth nach Sensoren in der Nähe (leer = keiner gefunden).
  scan: () => Promise<FoundDevice[]>
  // Verbindung zum gewählten Sensor aufbauen und ihn dem Konto zuordnen (Claim-Token übergeben).
  open: (device: FoundDevice) => Promise<StepResult>
  // WLANs, die der Sensor selbst sieht (stärkstes zuerst).
  listNetworks: () => Promise<WifiNetwork[]>
  // Meldet, wenn der Sensor schon über sein gespeichertes WLAN online und zugeordnet ist (dann keine WLAN-Eingabe).
  watchAlreadyOnline: (onOnline: (info: { deviceId: string; ssid: string | null }) => void) => () => void
  // Zugangsdaten senden, auf WLAN und Anmeldung bei Callgreen warten. onStage meldet den Fortschritt.
  connect: (ssid: string, password: string, onStage: (stage: ConnectStage) => void) => Promise<ConnectResult>
  // Verbindung trennen (Ablauf verlassen).
  close: () => void
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// Testdaten der Vorschau: jedes WLAN der Liste klappt mit diesem Passwort, alles andere gilt als falsch.
export const MOCK_WIFI_PASSWORD = '12345678'

export const mockPairing: PairingAdapter = {
  prepare: async () => ({ ok: true }),
  scan: async () => {
    await wait(2600)
    return [{ deviceName: 'CALLGREEN-00A5D8', deviceId: 'cg-00A5D8' }]
  },
  open: async () => {
    await wait(900)
    return { ok: true }
  },
  watchAlreadyOnline: () => () => undefined,
  close: () => undefined,
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
