import { useCallback, useEffect, useRef, useState } from 'react'
import { Linking, PermissionsAndroid, Platform, Pressable } from 'react-native'
import {
  ESPDevice,
  ESPProvisionManager,
  ESPSecurity,
  ESPTransport,
} from '@orbital-systems/react-native-esp-idf-provisioning'
import { useAction, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { SectionLabel } from '../ui/section-label'
import { TextField } from '../ui/text-field'
import { WifiQrScanner } from '../ui/wifi-qr-scanner'
import { Spinner, Text, XStack, YStack } from 'tamagui'

// BLE-Onboarding nach Vertrag Firmware v7/v8: ESP-IDF Provisioning, Security 1 mit PoP,
// Custom Endpoints `claim` (vor den WLAN-Daten) und `status` (danach).
// v8: Das Gerät beendet BLE, sobald die App trennt, und hält die Session nach dem
// WLAN-Erfolg höchstens 60 s offen. Bis zum Claim-Ergebnis also verbunden bleiben.
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

type BleProvisioningProps = {
  onProvisioned: (deviceId: string) => Promise<void>
}

type ProvisioningState = 'scan' | 'connecting' | 'credentials' | 'sending' | 'waiting' | 'success'

type Claim = {
  claim_token: string
  claim_id: Id<'claim_tokens'>
  expires_at: number
}

// Antwort des `claim`-Endpoints. `error` fehlt bei älterer Firmware.
type ClaimResult = 'ok' | 'already_claimed' | 'invalid_token' | 'rejected'

class ClaimRejectedError extends Error {}

type DeviceStatus = {
  wifi?: string
  claim?: 'pending' | 'ok' | 'failed'
  http?: number
  // Optional ab der nächsten Firmware: Name des verbundenen WLANs. Nur verwenden, wenn es ein String ist.
  ssid?: unknown
}

const NOT_FOUND_MESSAGE = 'Kein Sensor gefunden. Ist er per USB-C eingesteckt und Bluetooth eingeschaltet?'

let popLengthLogged = false

const toDeviceId = (deviceName: string) => deviceName.replace(DEVICE_NAME_PREFIX, 'cg-')

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function requestBluetoothPermission() {
  if (Platform.OS !== 'android') {
    return true
  }

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

export function BleProvisioning({ onProvisioned }: BleProvisioningProps) {
  const createClaimToken = useAction(api.devices.createClaimToken)
  const [state, setState] = useState<ProvisioningState>('scan')
  const [isSearching, setIsSearching] = useState(false)
  const [devices, setDevices] = useState<ESPDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState<ESPDevice | null>(null)
  const [deviceId, setDeviceId] = useState('')
  const [claim, setClaim] = useState<Claim | null>(null)
  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const [wifiNetworks, setWifiNetworks] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [qrSuccessMessage, setQrSuccessMessage] = useState('')
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false)
  const [ssidSuggestion, setSsidSuggestion] = useState('')
  const [canRestartPairing, setCanRestartPairing] = useState(false)
  // Gesetzt, wenn der Sensor schon vor der WLAN-Eingabe online und zugeordnet war.
  const [alreadyOnline, setAlreadyOnline] = useState<{ ssid: string | null } | null>(null)
  // true, sobald der Nutzer WLAN-Daten abgeschickt hat.
  const credentialsSent = useRef(false)
  // Laufende status-Abfrage vor der WLAN-Eingabe, damit sich BLE-Anfragen nicht überschneiden.
  const preCredentialsRead = useRef<Promise<unknown> | null>(null)
  const [isRetryingClaim, setIsRetryingClaim] = useState(false)
  const [isAwaitingBackend, setIsAwaitingBackend] = useState(false)
  const backendGrace = useRef(false)
  const statusReadFailures = useRef(0)
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const claimTimeoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const claimRetries = useRef(0)
  // Token, den das Gerät in dieser Pairing-Runde angenommen hat (für `already_claimed`).
  const acceptedClaim = useRef<Claim | null>(null)
  // Einmaliges Log, ob der erste `status`-Aufruf nach dem WLAN-Erfolg durchgeht
  // (Android baut dafür einen zweiten Security-1-Handshake auf).
  const statusProbe = useRef<{ startedAt: number; failures: number; logged: boolean } | null>(null)
  const wifiScan = useRef<Promise<unknown> | null>(null)
  const connectedDevice = useRef<ESPDevice | null>(null)
  // Nur nach Verbindungsabbrüchen wird die BLE-Session neu aufgebaut. Nach AUTH_ERROR oder
  // NETWORK_NOT_FOUND nimmt das Gerät neue WLAN-Daten auf derselben Verbindung an.
  const needsReconnect = useRef(false)
  const flowComplete = useRef(false)
  const ssidInputRef = useRef<{ focus: () => void }>(null)
  const passwordInputRef = useRef<{ focus: () => void }>(null)

  // Rückfallebene, falls die BLE-Session vor der Claim-Bestätigung abreißt. Läuft schon ab der
  // Eingabe der WLAN-Daten mit: Nach einem WLAN-Fehler versucht das Gerät parallel sein
  // vorheriges WLAN weiter und kann sich darüber trotzdem anmelden.
  const claimStatus = useQuery(
    api.devices.getClaimStatus,
    claim && (state === 'credentials' || state === 'sending' || state === 'waiting')
      ? { claim_id: claim.claim_id }
      : 'skip',
  )

  const clearTimers = useCallback(() => {
    if (statusTimer.current) clearTimeout(statusTimer.current)
    if (claimTimeoutTimer.current) clearTimeout(claimTimeoutTimer.current)
    statusTimer.current = null
    claimTimeoutTimer.current = null
  }, [])

  const disconnect = useCallback(() => {
    try {
      connectedDevice.current?.disconnect()
    } catch {
      // Verbindung ist bereits weg.
    }
    connectedDevice.current = null
  }, [])

  // Pro Pairing-Durchlauf ein Token; bei Wiederverbindungen innerhalb des Durchlaufs wiederverwendet.
  const ensureClaim = async () => {
    if (claim && claim.expires_at - Date.now() > CLAIM_TOKEN_MIN_REMAINING_MS) {
      return claim
    }
    const freshClaim = await createClaimToken({})
    setClaim(freshClaim)
    return freshClaim
  }

  const startScan = useCallback(async () => {
    clearTimers()
    disconnect()
    setErrorMessage('')
    setQrSuccessMessage('')
    setDevices([])
    setSelectedDevice(null)
    setDeviceId('')
    setWifiNetworks([])
    setClaim(null)
    setState('scan')
    setCanRestartPairing(false)
    setIsRetryingClaim(false)
    needsReconnect.current = false
    flowComplete.current = false
    claimRetries.current = 0
    acceptedClaim.current = null
    credentialsSent.current = false
    setAlreadyOnline(null)

    if (Platform.OS === 'android') {
      // Android protects SSIDs behind location permission. iOS is skipped on
      // purpose: the Wi-Fi entitlement and a new Apple build are not included.
      void import('expo-location')
        .then((location) => location.requestForegroundPermissionsAsync())
        .then(async (permission) => {
          if (!permission.granted) return
          let network: Awaited<ReturnType<(typeof import('@react-native-community/netinfo'))['fetch']>>
          try {
            const netInfo = await import('@react-native-community/netinfo')
            network = await netInfo.default.fetch()
          } catch {
            return
          }
          const currentSsid = network.type === 'wifi' ? network.details?.ssid : null
          if (currentSsid) {
            setSsidSuggestion(currentSsid)
            setSsid((currentValue) => currentValue || currentSsid)
          }
        })
        .catch(() => undefined)
    }

    if (Platform.OS === 'web') {
      setErrorMessage('Die Sensor-Einrichtung ist nur auf einem iOS- oder Android-Gerät verfügbar.')
      return
    }

    if (!PROOF_OF_POSSESSION) {
      setErrorMessage('Diese App-Version ist nicht für die Sensor-Einrichtung konfiguriert (EXPO_PUBLIC_ESP_POP fehlt).')
      return
    }

    if (!(await requestBluetoothPermission())) {
      setErrorMessage('Bluetooth-Berechtigung fehlt. Sie wird für die Gerätesuche benötigt.')
      return
    }

    setIsSearching(true)
    try {
      const foundDevices = await ESPProvisionManager.searchESPDevices(
        DEVICE_NAME_PREFIX,
        ESPTransport.ble,
        ESPSecurity.secure,
      )
      setDevices(foundDevices)
      if (foundDevices.length === 0) {
        setErrorMessage(NOT_FOUND_MESSAGE)
      }
    } catch (error) {
      const message = errorText(error)
      if (/permission/i.test(message)) {
        setErrorMessage('Bluetooth-Berechtigung fehlt. Sie wird für die Gerätesuche benötigt.')
      } else if (/no .*device found/i.test(message)) {
        setErrorMessage(NOT_FOUND_MESSAGE)
      } else {
        setErrorMessage('Die Bluetooth-Suche hat nicht geklappt. Ist Bluetooth eingeschaltet?')
      }
    } finally {
      setIsSearching(false)
    }
  }, [clearTimers, disconnect])

  useEffect(() => {
    void startScan()
    return () => {
      clearTimers()
      disconnect()
      setIsQrScannerOpen(false)
    }
  }, [startScan, clearTimers, disconnect])

  // Baut die BLE-Session auf und übergibt den Claim-Token. Danach wartet das Gerät auf WLAN-Daten.
  const openSession = async (device: ESPDevice) => {
    const activeClaim = await ensureClaim()
    if (!popLengthLogged) {
      popLengthLogged = true
      // Nur die Länge, nie den Wert. Erwartet: 16.
      console.log(`[ble-provisioning] PoP-Länge: ${PROOF_OF_POSSESSION.length}`)
    }
    await device.connect(PROOF_OF_POSSESSION)
    connectedDevice.current = device
    const result = await submitClaim(device, activeClaim)
    if (result === 'already_claimed') {
      // Das Gerät kennt den Claim aus der vorherigen Session (z. B. nach einem WLAN-Fehler).
      // Claim-Schritt überspringen, weiter mit den WLAN-Daten.
      if (acceptedClaim.current) setClaim(acceptedClaim.current)
    } else if (result !== 'ok') {
      throw new ClaimRejectedError(result)
    }
    needsReconnect.current = false
  }

  const sendClaimToken = async (device: ESPDevice, claimToken: string): Promise<ClaimResult> => {
    const response = JSON.parse(
      await device.sendData('claim', JSON.stringify({ claim_token: claimToken })),
    ) as { ok?: boolean; error?: string }
    if (response.ok === true) return 'ok'
    console.log(`[ble-provisioning] claim abgelehnt: ${response.error ?? '(kein Grund)'}`)
    if (response.error === 'already_claimed' || response.error === 'invalid_token') return response.error
    return 'rejected'
  }

  // Schickt den Token; bei `invalid_token` bis zu MAX_CLAIM_RETRIES neue Tokens.
  const submitClaim = async (device: ESPDevice, firstClaim: Claim): Promise<ClaimResult> => {
    let activeClaim = firstClaim
    let result = await sendClaimToken(device, activeClaim.claim_token)
    for (let attempt = 0; result === 'invalid_token' && attempt < MAX_CLAIM_RETRIES; attempt += 1) {
      activeClaim = await createClaimToken({})
      setClaim(activeClaim)
      result = await sendClaimToken(device, activeClaim.claim_token)
    }
    if (result === 'ok') acceptedClaim.current = activeClaim
    return result
  }

  const connectToDevice = async (device: ESPDevice) => {
    if (state !== 'scan') {
      return
    }

    setState('connecting')
    setErrorMessage('')
    setSelectedDevice(device)

    try {
      await openSession(device)
      setDeviceId(toDeviceId(device.name))
      setState('credentials')
      wifiScan.current = device
        .scanWifiList()
        .then((networks) => {
          const names = [...networks]
            .sort((left, right) => right.rssi - left.rssi)
            .map((network) => network.ssid)
            .filter((name, index, all) => name && all.indexOf(name) === index)
          setWifiNetworks(names.slice(0, 6))
        })
        .catch(() => undefined)
      watchBeforeCredentials(device)
    } catch (error) {
      disconnect()
      setSelectedDevice(null)
      setState('scan')
      setErrorMessage(
        error instanceof ClaimRejectedError
          ? 'Die Kopplung mit deinem Sensor hat nicht geklappt. Bitte versuche es erneut.'
          : 'Sensor konnte nicht verbunden werden. Bitte versuche es erneut.',
      )
    }
  }

  const finishSuccess = async (confirmedDeviceId: string) => {
    if (flowComplete.current) return
    flowComplete.current = true
    clearTimers()
    disconnect()
    try {
      await onProvisioned(confirmedDeviceId)
      setState('success')
      setErrorMessage('')
    } catch {
      setState('credentials')
      setCanRestartPairing(true)
      setErrorMessage('Dein Sensor ist verbunden, aber die App konnte nicht weitermachen. Bitte versuche es erneut.')
    }
  }

  const finishFailure = (message: string) => {
    if (flowComplete.current) return
    flowComplete.current = true
    clearTimers()
    disconnect()
    setState('credentials')
    setCanRestartPairing(true)
    setErrorMessage(message)
  }

  useEffect(() => {
    if (claimStatus?.status === 'claimed' && (state === 'credentials' || state === 'sending' || state === 'waiting')) {
      // Zugeordnet, bevor der Nutzer WLAN-Daten geschickt hat: Sensor nutzte sein gespeichertes WLAN.
      if (!credentialsSent.current) setAlreadyOnline((current) => current ?? { ssid: null })
      void finishSuccess(claimStatus.device_id ?? deviceId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimStatus, state])

  const claimFailureMessage = (http?: number) =>
    http === 410
      ? 'Die Kopplung ist abgelaufen. Starte das Pairing bitte neu.'
      : `Dein Sensor ist im WLAN, konnte sich aber nicht bei Planty anmelden${http ? ` (Fehler ${http})` : ''}. Hat dein WLAN Internetzugang? Starte das Pairing danach neu.`

  const readStatus = async (device: ESPDevice): Promise<DeviceStatus | null> => {
    try {
      return JSON.parse(await device.sendData('status', '{}')) as DeviceStatus
    } catch {
      return null
    }
  }

  // Vor der WLAN-Eingabe: Ist der Sensor über sein gespeichertes WLAN schon online und hat den
  // Claim abgeschlossen, braucht es keine Eingabe mehr. Endet, sobald WLAN-Daten abgeschickt werden.
  const watchBeforeCredentials = (device: ESPDevice) => {
    const check = async () => {
      if (flowComplete.current || credentialsSent.current) return
      await wifiScan.current
      if (flowComplete.current || credentialsSent.current) return
      const read = readStatus(device)
      preCredentialsRead.current = read
      const status = await read
      preCredentialsRead.current = null
      if (flowComplete.current || credentialsSent.current) return

      if (status?.wifi === 'connected' && status.claim === 'ok') {
        const connectedSsid = typeof status.ssid === 'string' && status.ssid.trim() ? status.ssid.trim() : null
        setAlreadyOnline({ ssid: connectedSsid })
        void finishSuccess(toDeviceId(device.name))
        return
      }
      statusTimer.current = setTimeout(() => void check(), PRE_CREDENTIALS_POLL_MS)
    }
    void check()
  }

  // Neuer Claim-Token in derselben BLE-Session. Bewusst KEINE WLAN-Daten: Das Gerät ist schon
  // im WLAN und führt den Claim selbst aus, sobald es den Token hat (status springt auf "pending").
  // Ein erneutes provision() lehnt das Gerät ab ("Wi-Fi credentials already received").
  const retryClaim = async (device: ESPDevice, lastHttp?: number) => {
    claimRetries.current += 1
    setIsRetryingClaim(true)
    let result: ClaimResult | null = null
    try {
      const freshClaim = await createClaimToken({})
      if (flowComplete.current) return
      setClaim(freshClaim)
      // `already_claimed` heißt hier: Das Gerät nimmt keinen neuen Token an.
      result = await submitClaim(device, freshClaim)
    } catch {
      // Teilschritt fehlgeschlagen. Ob abgebrochen wird, entscheidet der Gerätestatus.
    }
    if (flowComplete.current) return

    if (result !== 'ok') {
      // Vor jedem Abbruch einmal status prüfen: Solange ein Claim läuft, nicht trennen.
      const status = await readStatus(device)
      if (flowComplete.current) return
      if (status?.claim === 'ok') {
        void finishSuccess(deviceId)
        return
      }
      if (status?.claim === 'failed') {
        if (result === null && claimRetries.current < MAX_CLAIM_RETRIES) {
          // Token kam nicht an, nächster Versuch über das Polling.
          pollDeviceStatus(device)
          return
        }
        finishFailure(
          result === null
            ? claimFailureMessage(lastHttp)
            : 'Dein Sensor nimmt gerade keine neue Kopplung an. Steck ihn kurz ab und wieder an und starte das Pairing neu.',
        )
        return
      }
      // "pending" oder Status nicht lesbar: weiter pollen, die 45-s-Frist begrenzt das.
    }
    pollDeviceStatus(device)
  }

  // Fragt `status` ab, bis der Claim entschieden ist. Die Verbindung bleibt dabei offen;
  // getrennt wird erst in finishSuccess/finishFailure. Einzelne Lesefehler beenden das
  // Polling nicht, das Backend (getClaimStatus) läuft parallel als Rückfallebene.
  const pollDeviceStatus = (device: ESPDevice) => {
    statusTimer.current = setTimeout(async () => {
      if (flowComplete.current) return
      let status: DeviceStatus | null = null
      const probe = statusProbe.current
      try {
        status = JSON.parse(await device.sendData('status', '{}')) as DeviceStatus
        statusReadFailures.current = 0
        if (probe && !probe.logged) {
          probe.logged = true
          console.log(
            `[ble-provisioning] status nach WLAN-Erfolg (${Platform.OS}) ok nach ${Date.now() - probe.startedAt} ms, ${probe.failures} Fehlversuche, claim=${status.claim ?? '?'}`,
          )
        }
      } catch (error) {
        if (probe && !probe.logged) {
          probe.failures += 1
          if (probe.failures === 1) {
            console.log(`[ble-provisioning] status nach WLAN-Erfolg (${Platform.OS}) fehlgeschlagen: ${errorText(error)}`)
          }
        }
        statusReadFailures.current += 1
        if (statusReadFailures.current === MAX_STATUS_READ_FAILURES) {
          // BLE vermutlich beendet. Ohne Trennen weiter versuchen (falls nur der Handshake
          // hakt), die Entscheidung liegt jetzt aber beim Backend.
          enterBackendGrace('ble_lost')
        }
        // Nächster Versuch in einer Sekunde.
      }
      if (flowComplete.current) return

      if (status?.claim === 'ok') {
        void finishSuccess(deviceId)
        return
      }
      if (status?.claim === 'failed') {
        if (claimRetries.current < MAX_CLAIM_RETRIES) {
          await retryClaim(device, status.http)
        } else {
          finishFailure(claimFailureMessage(status.http))
        }
        return
      }
      pollDeviceStatus(device)
    }, STATUS_POLL_INTERVAL_MS)
  }

  // Kein Ergebnis per BLE (Frist abgelaufen oder Verbindung beendet): Fehler erst zeigen,
  // wenn auch getClaimStatus innerhalb von BACKEND_GRACE_MS keinen Erfolg meldet. Kommt der
  // Erfolg über Convex, schließt der getClaimStatus-Effekt normal über finishSuccess ab.
  const enterBackendGrace = (reason: 'timeout' | 'ble_lost') => {
    if (flowComplete.current || backendGrace.current) return
    backendGrace.current = true
    setIsAwaitingBackend(true)
    console.log(`[ble-provisioning] kein Ergebnis per BLE (${reason}), warte auf Backend`)
    if (claimTimeoutTimer.current) clearTimeout(claimTimeoutTimer.current)
    if (reason === 'timeout') {
      if (statusTimer.current) clearTimeout(statusTimer.current)
      statusTimer.current = null
      disconnect()
    }
    claimTimeoutTimer.current = setTimeout(() => {
      finishFailure('Die Einrichtung hat zu lange gedauert. Bitte versuche es erneut.')
    }, BACKEND_GRACE_MS)
  }

  // WLAN steht. Nicht trennen, sondern status pollen, bis der Claim entschieden ist.
  const waitForClaim = (device: ESPDevice) => {
    setState('waiting')
    backendGrace.current = false
    setIsAwaitingBackend(false)
    statusReadFailures.current = 0
    statusProbe.current = { startedAt: Date.now(), failures: 0, logged: false }
    pollDeviceStatus(device)
    claimTimeoutTimer.current = setTimeout(() => enterBackendGrace('timeout'), CLAIM_RESULT_TIMEOUT_MS)
  }

  const sendCredentials = async () => {
    if (!selectedDevice || !ssid.trim() || state === 'sending' || state === 'waiting') {
      return
    }

    setState('sending')
    setErrorMessage('')
    setQrSuccessMessage('')
    setCanRestartPairing(false)
    setIsRetryingClaim(false)
    flowComplete.current = false
    claimRetries.current = 0
    credentialsSent.current = true
    // Vorab-Abfrage stoppen und eine laufende abwarten, bevor die WLAN-Daten gesendet werden.
    if (statusTimer.current) clearTimeout(statusTimer.current)
    statusTimer.current = null
    await preCredentialsRead.current

    try {
      if (needsReconnect.current) {
        disconnect()
        await openSession(selectedDevice)
      } else {
        // Laufenden WLAN-Scan des Geräts abwarten, damit sich BLE-Anfragen nicht überschneiden.
        await wifiScan.current
      }
    } catch (error) {
      needsReconnect.current = true
      setState('credentials')
      setCanRestartPairing(true)
      setErrorMessage(
        error instanceof ClaimRejectedError
          ? 'Die Kopplung mit deinem Sensor hat nicht geklappt. Starte das Pairing bitte neu.'
          : 'Die Verbindung zum Sensor ist abgerissen. Steckt er noch am USB-Kabel? Starte das Pairing sonst neu.',
      )
      return
    }

    const wifi = { ssid: ssid.trim(), password }
    try {
      await selectedDevice.provision(wifi.ssid, wifi.password)
    } catch (error) {
      const message = errorText(error)
      // Das Gerät kann parallel noch sein vorheriges WLAN nutzen, die Texte gehen deshalb
      // nicht davon aus, dass es offline ist.
      setState('credentials')
      if (/auth/i.test(message)) {
        setErrorMessage('Das WLAN-Passwort scheint nicht zu stimmen. Prüfe es und versuche es erneut.')
        setPassword('')
        setTimeout(() => passwordInputRef.current?.focus(), 100)
      } else if (/not.?found/i.test(message)) {
        setErrorMessage(`Das WLAN '${wifi.ssid}' wurde nicht gefunden. Tippfehler im Namen? Und denk dran: Planty funkt nur auf 2,4 GHz, nicht auf 5 GHz.`)
        setTimeout(() => ssidInputRef.current?.focus(), 100)
      } else {
        // Unklarer Fehler: Vor dem Abbruch einmal status prüfen. Meldet das Gerät wifi
        // "connected", ist es im WLAN und der Claim läuft, also verbunden bleiben.
        const status = await readStatus(selectedDevice)
        if (status?.wifi === 'connected') {
          console.log(`[ble-provisioning] WLAN-Daten meldeten Fehler, Gerät ist aber im WLAN (claim=${status.claim ?? '?'})`)
          waitForClaim(selectedDevice)
          return
        }
        // Z. B. DEVICE_DISCONNECTED: beim nächsten Versuch neu verbinden.
        needsReconnect.current = true
        setErrorMessage('Die Verbindung hat nicht geklappt. Prüfe Passwort und ob dein Router 2,4 GHz aktiv hat.')
      }
      return
    }

    waitForClaim(selectedDevice)
  }

  if (state === 'credentials' || state === 'sending' || state === 'waiting' || state === 'success') {
    return (
      <Card>
        <SectionLabel>Sensor verbunden</SectionLabel>
        <YStack gap="$4">
          <Text fontFamily="$heading" fontSize={24} color="$textPrimary">
            {deviceId}
          </Text>
          <Text fontFamily="$body" color="$textSecondary">
            Schließe nur ein Gerät gleichzeitig an.
          </Text>
        </YStack>
        {state === 'success' ? (
          <YStack gap="$4">
            <Text fontFamily="$body" color="$accent">Dein Sensor ist online und deinem Konto zugeordnet.</Text>
            {alreadyOnline ? (
              <Text fontFamily="$body" color="$textSecondary">
                {alreadyOnline.ssid
                  ? `Dein Sensor war schon mit dem WLAN „${alreadyOnline.ssid}“ verbunden, du musst nichts mehr eingeben.`
                  : 'Dein Sensor war schon mit dem WLAN verbunden, du musst nichts mehr eingeben.'}
              </Text>
            ) : null}
          </YStack>
        ) : state === 'waiting' ? (
          <YStack gap="$4">
            <Text fontFamily="$heading" fontSize={22} color="$textPrimary">
              Dein Planty ist unterwegs
            </Text>
            <Text fontFamily="$body" color="$textSecondary">
              {isAwaitingBackend
                ? 'Die Bluetooth-Verbindung zum Sensor ist beendet. Wir warten noch kurz, ob er sich über dein WLAN bei Planty meldet.'
                : isRetryingClaim
                ? 'Die Anmeldung hat nicht sofort geklappt. Wir versuchen es mit einem neuen Kopplungscode noch einmal.'
                : 'Der Sensor ist im WLAN und meldet sich jetzt bei Planty an. Das dauert meist nur ein paar Sekunden. Lass die App so lange offen.'}
            </Text>
            <Spinner color="$accent" />
          </YStack>
        ) : isQrScannerOpen ? (
          <WifiQrScanner
            onFound={({ ssid: scannedSsid, password: scannedPassword }) => {
              setSsid(scannedSsid)
              setPassword(scannedPassword)
              setIsQrScannerOpen(false)
              setErrorMessage('')
              setQrSuccessMessage('WLAN-Code erkannt. Bitte prüfe die ausgefüllten Daten, bevor du fortfährst.')
            }}
            onClose={() => setIsQrScannerOpen(false)}
            onError={(message) => {
              setIsQrScannerOpen(false)
              setErrorMessage(message)
            }}
          />
        ) : (
          <YStack gap="$12">
            {wifiNetworks.length > 0 ? (
              <YStack gap="$8">
                <Text fontFamily="$body" fontSize={12} color="$textSecondary">
                  WLANs, die dein Sensor sieht:
                </Text>
                <XStack gap="$8" flexWrap="wrap">
                  {wifiNetworks.map((network) => (
                    <Pressable key={network} onPress={() => setSsid(network)}>
                      <XStack
                        borderWidth={1}
                        borderColor={ssid === network ? '$accent' : '$border'}
                        borderRadius="$8"
                        paddingHorizontal="$12"
                        paddingVertical="$8"
                      >
                        <Text fontFamily="$body" color="$textPrimary">{network}</Text>
                      </XStack>
                    </Pressable>
                  ))}
                </XStack>
              </YStack>
            ) : Platform.OS === 'android' ? (
              <Text fontFamily="$body" fontSize={12} color="$textSecondary">
                Android schützt WLAN-Namen über die Standortberechtigung. Wir fragen sie nur für diesen Vorschlag an; du kannst den Namen jederzeit selbst eingeben.
              </Text>
            ) : null}
            <TextField
              label="WLAN-Name (SSID)"
              inputRef={ssidInputRef}
              value={ssid}
              onChangeText={setSsid}
              placeholder={ssidSuggestion || 'Dein WLAN'}
              autoCapitalize="none"
              autoComplete="off"
              textContentType="username"
            />
            <TextField
              label="WLAN-Passwort"
              inputRef={passwordInputRef}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
            />
            {errorMessage ? <Text fontFamily="$body" color="$critical">{errorMessage}</Text> : null}
            {qrSuccessMessage ? <Text fontFamily="$body" color="$accent">{qrSuccessMessage}</Text> : null}
            <Button variant="secondary" onPress={() => setIsQrScannerOpen(true)}>
              WLAN-Code am Router scannen
            </Button>
            <Button onPress={() => void sendCredentials()} loading={state === 'sending'} disabled={!ssid.trim() || canRestartPairing}>
              WLAN verbinden
            </Button>
            {canRestartPairing ? (
              <Button variant="secondary" onPress={() => void startScan()}>
                Pairing neu starten
              </Button>
            ) : null}
          </YStack>
        )}
      </Card>
    )
  }

  return (
    <Card>
      <SectionLabel>Sensor verbinden</SectionLabel>
      <YStack gap="$8">
        <Text fontFamily="$heading" fontSize={24} color="$textPrimary">
          Finde deinen Planty-Sensor
        </Text>
        <Text fontFamily="$body" color="$textSecondary">
          Stecke den Sensor per USB-C ein und lasse Bluetooth eingeschaltet.
        </Text>
      </YStack>
      {devices.length > 0 ? (
        <YStack gap="$8">
          {devices.map((device) => (
            <Pressable key={device.name} onPress={() => void connectToDevice(device)} disabled={state !== 'scan'}>
              <XStack borderWidth={1} borderColor="$border" borderRadius="$8" padding="$12" justifyContent="space-between" alignItems="center">
                <YStack gap="$2">
                  <Text fontFamily="$body" fontWeight="700" color="$textPrimary">{toDeviceId(device.name)}</Text>
                  <Text fontFamily="$body" fontSize={12} color="$textSecondary">Planty-Sensor</Text>
                </YStack>
                <Text color="$accent">Verbinden</Text>
              </XStack>
            </Pressable>
          ))}
        </YStack>
      ) : (
        <Text fontFamily="$body" color="$textSecondary">
          {errorMessage || 'Suche nach erreichbaren Planty-Sensoren ...'}
        </Text>
      )}
      {devices.length === 0 && errorMessage === NOT_FOUND_MESSAGE ? (
        <Text fontFamily="$body" fontSize={12} color="$textSecondary">
          Ist dein Planty schon eingerichtet und mit deinem WLAN verbunden, taucht er hier nicht auf. Das ist normal. Neu einrichten lässt er sich erst, wenn er sein WLAN nicht mehr erreicht.
        </Text>
      ) : null}
      {devices.length > 0 && errorMessage ? <Text fontFamily="$body" color="$critical">{errorMessage}</Text> : null}
      {errorMessage.includes('Berechtigung') ? (
        <Button variant="secondary" onPress={() => void Linking.openSettings()}>
          Einstellungen öffnen
        </Button>
      ) : null}
      {state === 'connecting' || isSearching ? <Spinner color="$accent" /> : null}
      {!errorMessage.includes('Berechtigung') ? (
        <Button variant="secondary" onPress={() => void startScan()} disabled={isSearching || state === 'connecting'}>
          Erneut suchen
        </Button>
      ) : null}
    </Card>
  )
}
