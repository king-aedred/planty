import { ESPDevice, ESPProvisionManager, ESPSecurity, ESPTransport, ESPWifiAuthMode } from '@orbital-systems/react-native-esp-idf-provisioning'
import { PermissionsAndroid, Platform } from 'react-native'
import type { ConnectResult, ConnectStage, FoundDevice, PairingAdapter, StepResult, WifiNetwork } from './sensor-pairing'

// Echte Sensor-Kopplung nach Vertrag Firmware v7/v8 (Logik aus dem bisherigen Baustein ble-provisioning.tsx):
// ESP-IDF Provisioning über BLE, Security 1 mit PoP, Custom Endpoints `claim` (vor den WLAN-Daten) und
// `status` (danach). Das Gerät beendet BLE, sobald die App trennt, und hält die Session nach dem WLAN-Erfolg
// höchstens 60 s offen; bis zum Claim-Ergebnis deshalb verbunden bleiben. Parallel meldet das Backend über
// getClaimStatus, wenn der Claim durch ist (Rückfallebene bei abgerissener Verbindung).
// Logs nur mit Präfix [ble-pairing], nie Token, PoP oder Passwort.

const DEVICE_NAME_PREFIX = 'CALLGREEN-'
// Für alle Geräte gleich (16 alphanumerische Zeichen), kommt aus .env bzw. EAS. Nie im Repo ablegen.
const PROOF_OF_POSSESSION = process.env.EXPO_PUBLIC_ESP_POP ?? ''
const STATUS_POLL_INTERVAL_MS = 1000
// Abstand der status-Abfragen, während der Nutzer noch WLAN-Daten eingibt.
const PRE_CREDENTIALS_POLL_MS = 3000
// Puffer unter dem 60-s-Hard-Cap des Geräts.
const CLAIM_RESULT_TIMEOUT_MS = 45000
// Danach (oder wenn BLE abreißt) noch so lange auf das Backend-Signal getClaimStatus warten.
const BACKEND_GRACE_MS = 45000
// So viele status-Lesefehler in Folge gelten als "BLE-Verbindung beendet".
const MAX_STATUS_READ_FAILURES = 3
// Neue Claim-Tokens pro BLE-Session, falls der Claim beim Backend scheitert (z. B. 410).
const MAX_CLAIM_RETRIES = 2
// Restlaufzeit, ab der vor einer neuen BLE-Session ein frischer Claim-Token geholt wird.
const CLAIM_TOKEN_MIN_REMAINING_MS = 3 * 60 * 1000

export type Claim = { claim_token: string; claim_id: string; expires_at: number }

type BlePairingDeps = {
  createClaimToken: () => Promise<Claim>
  // Meldet die device_id, sobald das Backend den Claim bestätigt. Gibt eine Abmelde-Funktion zurück.
  watchClaim: (claimId: string, onClaimed: (deviceId: string | null) => void) => () => void
}

// Antwort des `claim`-Endpoints. `error` fehlt bei älterer Firmware.
type ClaimResult = 'ok' | 'already_claimed' | 'invalid_token' | 'rejected'

type DeviceStatus = {
  wifi?: string
  claim?: 'pending' | 'ok' | 'failed'
  http?: number
  // Name des verbundenen WLANs (ab Firmware v8). Nur verwenden, wenn es ein String ist.
  ssid?: unknown
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))
const toDeviceId = (deviceName: string) => deviceName.replace(DEVICE_NAME_PREFIX, 'cg-')
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const claimFailureMessage = (http?: number) =>
  http === 410
    ? 'Die Kopplung ist abgelaufen. Starte sie bitte neu.'
    : `Dein Sensor ist im WLAN, konnte sich aber nicht bei Callgreen anmelden${http ? ` (Fehler ${http})` : ''}. Hat dein WLAN Internetzugang?`

async function requestBluetoothPermission() {
  if (Platform.OS !== 'android') return true
  // Die native Library prüft auf Android zusätzlich ACCESS_FINE_LOCATION für den BLE-Scan.
  const permissions =
    Number(Platform.Version) >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]
  const result = await PermissionsAndroid.requestMultiple(permissions)
  return permissions.every((permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED)
}

export function createBlePairing(deps: BlePairingDeps): PairingAdapter {
  let found: ESPDevice[] = []
  let device: ESPDevice | null = null
  let claim: Claim | null = null
  // Token, den das Gerät in dieser Runde angenommen hat (für `already_claimed` beim Neuverbinden).
  let acceptedClaim: Claim | null = null
  // Nach Verbindungsabbrüchen wird die Session vor dem nächsten Senden neu aufgebaut. Nach AUTH_ERROR
  // oder NETWORK_NOT_FOUND nimmt das Gerät neue WLAN-Daten auf derselben Verbindung an.
  let needsReconnect = false
  let credentialsSent = false
  let wifiScan: Promise<unknown> | null = null
  let statusRead: Promise<unknown> | null = null
  let preTimer: ReturnType<typeof setTimeout> | null = null
  let unwatchClaim: (() => void) | null = null

  const disconnect = () => {
    try {
      device?.disconnect()
    } catch {
      // Verbindung ist bereits weg.
    }
  }

  const stopWatchers = () => {
    if (preTimer) clearTimeout(preTimer)
    preTimer = null
    unwatchClaim?.()
    unwatchClaim = null
  }

  // Pro Durchlauf ein Token; bei Wiederverbindungen wiederverwendet, solange er noch lange genug gilt.
  const ensureClaim = async () => {
    if (claim && claim.expires_at - Date.now() > CLAIM_TOKEN_MIN_REMAINING_MS) return claim
    claim = await deps.createClaimToken()
    return claim
  }

  const readStatus = async (target: ESPDevice): Promise<DeviceStatus | null> => {
    const read = target.sendData('status', '{}').then((raw) => JSON.parse(raw) as DeviceStatus)
    statusRead = read.catch(() => null)
    try {
      return await read
    } catch {
      return null
    } finally {
      statusRead = null
    }
  }

  const sendClaimToken = async (target: ESPDevice, token: string): Promise<ClaimResult> => {
    const response = JSON.parse(await target.sendData('claim', JSON.stringify({ claim_token: token }))) as { ok?: boolean; error?: string }
    if (response.ok === true) return 'ok'
    console.log(`[ble-pairing] claim abgelehnt: ${response.error ?? '(kein Grund)'}`)
    if (response.error === 'already_claimed' || response.error === 'invalid_token') return response.error
    return 'rejected'
  }

  // Schickt den Token; bei `invalid_token` bis zu MAX_CLAIM_RETRIES neue Tokens.
  const submitClaim = async (target: ESPDevice, first: Claim): Promise<ClaimResult> => {
    let active = first
    let result = await sendClaimToken(target, active.claim_token)
    for (let attempt = 0; result === 'invalid_token' && attempt < MAX_CLAIM_RETRIES; attempt += 1) {
      active = await deps.createClaimToken()
      claim = active
      result = await sendClaimToken(target, active.claim_token)
    }
    if (result === 'ok') acceptedClaim = active
    return result
  }

  // BLE-Session aufbauen und Claim-Token übergeben. Danach wartet das Gerät auf WLAN-Daten.
  const openSession = async (target: ESPDevice) => {
    const active = await ensureClaim()
    await target.connect(PROOF_OF_POSSESSION, null, null)
    device = target
    const result = await submitClaim(target, active)
    if (result === 'already_claimed') {
      // Das Gerät kennt den Claim aus der vorherigen Session (z. B. nach einem WLAN-Fehler).
      if (acceptedClaim) claim = acceptedClaim
    } else if (result !== 'ok') {
      throw new Error(`claim_${result}`)
    }
    needsReconnect = false
  }

  // Wartet nach dem Senden der WLAN-Daten auf das Claim-Ergebnis: status pollen, bei claim "failed" neuer
  // Token in derselben Session (keine WLAN-Daten, das Gerät ist schon im WLAN), parallel das Backend.
  const waitForClaim = (target: ESPDevice, onStage: (stage: ConnectStage) => void) =>
    new Promise<ConnectResult>((resolve) => {
      let done = false
      let retries = 0
      let readFailures = 0
      let pollTimer: ReturnType<typeof setTimeout> | null = null
      let deadline: ReturnType<typeof setTimeout> | null = null
      let inGrace = false
      const deviceId = toDeviceId(target.name)

      const finish = (result: ConnectResult) => {
        if (done) return
        done = true
        if (pollTimer) clearTimeout(pollTimer)
        if (deadline) clearTimeout(deadline)
        stopWatchers()
        if (result.ok) {
          onStage('claim')
          onStage('done')
          disconnect()
        }
        resolve(result)
      }

      // Kein Ergebnis per BLE (Frist um oder Verbindung weg): Fehler erst zeigen, wenn auch das Backend
      // innerhalb der Nachfrist keinen Erfolg meldet.
      const enterGrace = (reason: 'timeout' | 'ble_lost') => {
        if (done || inGrace) return
        inGrace = true
        console.log(`[ble-pairing] kein Ergebnis per BLE (${reason}), warte auf Backend`)
        if (deadline) clearTimeout(deadline)
        if (reason === 'timeout') {
          if (pollTimer) clearTimeout(pollTimer)
          pollTimer = null
          disconnect()
        }
        deadline = setTimeout(() => finish({ ok: false, reason: 'timeout', message: 'Die Einrichtung hat zu lange gedauert. Versuch es bitte noch mal.' }), BACKEND_GRACE_MS)
      }

      const retryClaim = async (lastHttp?: number) => {
        retries += 1
        let result: ClaimResult | null = null
        try {
          const fresh = await deps.createClaimToken()
          claim = fresh
          watchBackend(fresh.claim_id)
          // `already_claimed` heißt hier: Das Gerät nimmt keinen neuen Token an.
          result = await submitClaim(target, fresh)
        } catch {
          // Teilschritt fehlgeschlagen; ob abgebrochen wird, entscheidet der Gerätestatus.
        }
        if (done) return
        if (result !== 'ok') {
          const status = await readStatus(target)
          if (done) return
          if (status?.claim === 'ok') return finish({ ok: true, deviceId })
          if (status?.claim === 'failed') {
            if (result === null && retries < MAX_CLAIM_RETRIES) return poll()
            return finish({
              ok: false,
              reason: 'other',
              message:
                result === null
                  ? claimFailureMessage(lastHttp)
                  : 'Dein Sensor nimmt gerade keine neue Kopplung an. Steck ihn kurz ab und wieder an und versuch es noch mal.',
            })
          }
        }
        poll()
      }

      const poll = () => {
        pollTimer = setTimeout(async () => {
          if (done) return
          let status: DeviceStatus | null = null
          try {
            status = JSON.parse(await target.sendData('status', '{}')) as DeviceStatus
            readFailures = 0
          } catch {
            readFailures += 1
            // BLE vermutlich beendet (auf Android oft ein zweiter Security-1-Handshake). Ohne Trennen weiter
            // versuchen, die Entscheidung liegt jetzt aber beim Backend.
            if (readFailures === MAX_STATUS_READ_FAILURES) enterGrace('ble_lost')
          }
          if (done) return
          if (status?.claim === 'ok') return finish({ ok: true, deviceId })
          if (status?.claim === 'failed') {
            if (retries < MAX_CLAIM_RETRIES) return void retryClaim(status.http)
            return finish({ ok: false, reason: 'other', message: claimFailureMessage(status.http) })
          }
          poll()
        }, STATUS_POLL_INTERVAL_MS)
      }

      const watchBackend = (claimId: string) => {
        unwatchClaim?.()
        unwatchClaim = deps.watchClaim(claimId, (confirmed) => finish({ ok: true, deviceId: confirmed ?? deviceId }))
      }

      if (claim) watchBackend(claim.claim_id)
      poll()
      deadline = setTimeout(() => enterGrace('timeout'), CLAIM_RESULT_TIMEOUT_MS)
    })

  return {
    prepare: async (): Promise<StepResult> => {
      if (Platform.OS === 'web') return { ok: false, message: 'Die Sensor-Einrichtung geht nur am Handy (iOS oder Android).' }
      if (!PROOF_OF_POSSESSION) return { ok: false, message: 'Diese App-Version ist nicht für die Sensor-Einrichtung konfiguriert.' }
      if (!(await requestBluetoothPermission())) {
        return { ok: false, message: 'Ohne Bluetooth-Berechtigung findet die App deinen Sensor nicht. Erlaube sie bitte in den Einstellungen deines Handys.' }
      }
      return { ok: true }
    },

    scan: async (): Promise<FoundDevice[]> => {
      // Ein noch verbundener Sensor wirbt nicht und würde sonst fehlen (z. B. nach „Zurück“).
      stopWatchers()
      disconnect()
      try {
        found = await ESPProvisionManager.searchESPDevices(DEVICE_NAME_PREFIX, ESPTransport.ble, ESPSecurity.secure)
      } catch (error) {
        // „No device found“ kommt als Fehler; alles andere gilt ebenfalls als „nichts gefunden“.
        console.log(`[ble-pairing] Suche: ${errorText(error)}`)
        found = []
      }
      return found.map((entry) => ({ deviceName: entry.name, deviceId: toDeviceId(entry.name) }))
    },

    open: async (choice: FoundDevice): Promise<StepResult> => {
      const target = found.find((entry) => entry.name === choice.deviceName)
      if (!target) return { ok: false, message: 'Der Sensor ist nicht mehr in Reichweite. Such bitte noch mal.' }
      disconnect()
      credentialsSent = false
      acceptedClaim = null
      try {
        await openSession(target)
        return { ok: true }
      } catch (error) {
        disconnect()
        return {
          ok: false,
          message: errorText(error).startsWith('claim_')
            ? 'Die Kopplung mit deinem Sensor hat nicht geklappt. Versuch es bitte noch mal.'
            : 'Der Sensor konnte nicht verbunden werden. Steckt er am USB-Kabel?',
        }
      }
    },

    listNetworks: async (): Promise<WifiNetwork[]> => {
      if (!device) return []
      const scan = device.scanWifiList()
      wifiScan = scan.catch(() => null)
      try {
        const networks = await scan
        const bySsid = new Map<string, WifiNetwork>()
        for (const network of networks) {
          if (!network.ssid) continue
          const current = bySsid.get(network.ssid)
          if (!current || network.rssi > current.rssi) {
            bySsid.set(network.ssid, { ssid: network.ssid, rssi: network.rssi, secure: network.auth !== ESPWifiAuthMode.open })
          }
        }
        return Array.from(bySsid.values()).sort((first, second) => second.rssi - first.rssi)
      } catch {
        return []
      } finally {
        wifiScan = null
      }
    },

    // Vor der WLAN-Eingabe: Ist der Sensor über sein gespeichertes WLAN schon online und zugeordnet
    // (z. B. nach „Sensor entfernen“), braucht es keine Eingabe. Gerät und Backend melden das unabhängig.
    watchAlreadyOnline: (onOnline) => {
      let active = true
      const target = device
      if (!target) return () => undefined
      const deviceId = toDeviceId(target.name)
      const report = (ssid: string | null) => {
        if (!active || credentialsSent) return
        active = false
        stopWatchers()
        disconnect()
        onOnline({ deviceId, ssid })
      }
      const check = async () => {
        if (!active || credentialsSent) return
        await wifiScan
        if (!active || credentialsSent) return
        const status = await readStatus(target)
        if (!active || credentialsSent) return
        if (status?.wifi === 'connected' && status.claim === 'ok') {
          report(typeof status.ssid === 'string' && status.ssid.trim() ? status.ssid.trim() : null)
          return
        }
        preTimer = setTimeout(() => void check(), PRE_CREDENTIALS_POLL_MS)
      }
      if (claim) {
        unwatchClaim?.()
        unwatchClaim = deps.watchClaim(claim.claim_id, () => report(null))
      }
      void check()
      return () => {
        active = false
        if (preTimer) clearTimeout(preTimer)
        preTimer = null
      }
    },

    connect: async (ssid, password, onStage): Promise<ConnectResult> => {
      if (!device) return { ok: false, reason: 'other', message: 'Die Verbindung zum Sensor ist weg. Such ihn bitte noch mal.' }
      const target = device
      credentialsSent = true
      // Vorab-Abfragen stoppen und laufende BLE-Anfragen abwarten, damit sich nichts überschneidet.
      stopWatchers()
      await statusRead
      await wifiScan
      if (needsReconnect) {
        try {
          disconnect()
          await openSession(target)
        } catch {
          needsReconnect = true
          return { ok: false, reason: 'other', message: 'Die Verbindung zum Sensor ist abgerissen. Steckt er noch am USB-Kabel?' }
        }
      }

      try {
        await target.provision(ssid, password)
      } catch (error) {
        const message = errorText(error)
        // Das Gerät nutzt parallel sein vorheriges WLAN weiter; neue Daten gehen über dieselbe Verbindung.
        credentialsSent = false
        if (/auth/i.test(message)) return { ok: false, reason: 'auth_failed' }
        if (/not.?found/i.test(message)) return { ok: false, reason: 'not_found' }
        // Unklarer Fehler: Meldet das Gerät trotzdem „connected“, läuft der Claim schon.
        const status = await readStatus(target)
        if (status?.wifi !== 'connected') {
          needsReconnect = true
          return { ok: false, reason: 'other', message: 'Das hat nicht geklappt. Prüf das Passwort und ob dein Router 2,4 GHz anbietet.' }
        }
        console.log(`[ble-pairing] WLAN-Daten meldeten Fehler, Gerät ist aber im WLAN (claim=${status.claim ?? '?'})`)
        credentialsSent = true
      }

      onStage('wifi')
      // Kurz Luft lassen: Auf Android baut der nächste Aufruf einen zweiten Security-1-Handshake auf.
      await sleep(300)
      return waitForClaim(target, onStage)
    },

    close: () => {
      stopWatchers()
      disconnect()
      device = null
    },
  }
}
