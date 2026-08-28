import { decode, encode } from 'base-64'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Linking, PermissionsAndroid, Platform, Pressable } from 'react-native'
import { BleManager, Device, State } from 'react-native-ble-plx'
import { useConvex } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { SectionLabel } from '../ui/section-label'
import { TextField } from '../ui/text-field'
import { Spinner, Text, XStack, YStack } from 'tamagui'

export const PLANTY_SERVICE_UUID = '7b7f0001-4e6d-4a5d-9b8e-2f2d6a0c1101'
const DEVICE_ID_UUID = '7b7f0002-4e6d-4a5d-9b8e-2f2d6a0c1101'
const WIFI_CREDENTIALS_UUID = '7b7f0003-4e6d-4a5d-9b8e-2f2d6a0c1101'
const SCAN_TIMEOUT_MS = 10000
const PROVISIONING_TIMEOUT_MS = 60000
const PROVISIONING_POLL_INTERVAL_MS = 2000

const bleManager = Platform.OS === 'web' ? null : new BleManager()

type BleProvisioningProps = {
  onProvisioned: (deviceId: string) => Promise<void>
}

type ProvisioningState = 'scan' | 'connecting' | 'credentials' | 'sending' | 'waiting' | 'success'

function getAdvertisedDeviceId(device: Device) {
  if (device.manufacturerData) {
    try {
      const advertisedId = decode(device.manufacturerData)
      if (advertisedId.startsWith('planty-')) {
        return advertisedId
      }
    } catch {
      // The name remains a useful fallback on platforms that normalize scan data.
    }
  }

  return device.localName ?? device.name ?? device.id
}

async function requestBluetoothPermission() {
  if (Platform.OS !== 'android') {
    return true
  }

  const apiLevel = Number(Platform.Version)
  if (apiLevel >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ])
    return (
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
    )
  }

  return (
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
  ) === PermissionsAndroid.RESULTS.GRANTED
}

export function BleProvisioning({ onProvisioned }: BleProvisioningProps) {
  const convex = useConvex()
  const [state, setState] = useState<ProvisioningState>('scan')
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [deviceId, setDeviceId] = useState('')
  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [canRestartPairing, setCanRestartPairing] = useState(false)
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const disconnectedSubscription = useRef<{ remove: () => void } | null>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const provisioningTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const expectedDisconnect = useRef(false)

  const stopScan = useCallback(() => {
    if (scanTimer.current) {
      clearTimeout(scanTimer.current)
      scanTimer.current = null
    }
    void bleManager?.stopDeviceScan()
  }, [])

  const startScan = useCallback(async () => {
    stopScan()
    setErrorMessage('')
    setDevices([])
    setSelectedDevice(null)
    setDeviceId('')
    setState('scan')
    setCanRestartPairing(false)
    expectedDisconnect.current = false

    if (!bleManager) {
      setErrorMessage('BLE-Provisioning ist nur auf einem iOS- oder Android-Gerät verfügbar.')
      return
    }

    if (!(await requestBluetoothPermission())) {
      setErrorMessage('Bluetooth-Berechtigung fehlt. Sie wird für die Gerätesuche benötigt.')
      return
    }

    const bluetoothState = await bleManager.state()
    if (bluetoothState === State.Unauthorized) {
      setErrorMessage('Bluetooth-Berechtigung fehlt. Sie wird für die Gerätesuche benötigt.')
      return
    }
    if (bluetoothState === State.Unsupported) {
      setErrorMessage('Dieses Gerät unterstützt Bluetooth Low Energy nicht.')
      return
    }
    if (bluetoothState !== State.PoweredOn) {
      setErrorMessage('Bluetooth ist ausgeschaltet. Bitte aktiviere Bluetooth und starte die Suche erneut.')
      return
    }

    bleManager.startDeviceScan([PLANTY_SERVICE_UUID], { allowDuplicates: false }, (error, device) => {
      if (error) {
        setErrorMessage('Bluetooth-Suche konnte nicht gestartet werden.')
        stopScan()
        return
      }
      if (!device) {
        return
      }

      setDevices((currentDevices) => {
        if (currentDevices.some((currentDevice) => currentDevice.id === device.id)) {
          return currentDevices
        }
        return [...currentDevices, device]
      })
    })

    scanTimer.current = setTimeout(() => {
      stopScan()
      setDevices((currentDevices) => {
        if (currentDevices.length === 0) {
          setErrorMessage('Kein Planty-Sensor gefunden. Ist das Gerät per USB-C eingesteckt und erstmals eingeschaltet?')
        }
        return currentDevices
      })
    }, SCAN_TIMEOUT_MS)
  }, [stopScan])

  useEffect(() => {
    void startScan()
    return () => {
      stopScan()
      disconnectedSubscription.current?.remove()
      if (pollTimer.current) clearTimeout(pollTimer.current)
      if (provisioningTimer.current) clearTimeout(provisioningTimer.current)
    }
  }, [startScan, stopScan])

  const connectToDevice = async (device: Device) => {
    if (state !== 'scan') {
      return
    }

    stopScan()
    setState('connecting')
    setErrorMessage('')
    setSelectedDevice(device)

    try {
      const connectedDevice = await device.connect()
      await connectedDevice.discoverAllServicesAndCharacteristics()
      const idCharacteristic = await connectedDevice.readCharacteristicForService(PLANTY_SERVICE_UUID, DEVICE_ID_UUID)
      const connectedDeviceId = idCharacteristic.value ? decode(idCharacteristic.value) : getAdvertisedDeviceId(device)
      setDeviceId(connectedDeviceId)
      setSelectedDevice(connectedDevice)
      disconnectedSubscription.current = connectedDevice.onDisconnected(() => {
        if (expectedDisconnect.current) {
          setState('waiting')
          setErrorMessage('Dein Planty startet neu und verbindet sich mit dem WLAN.')
          return
        }
        setSelectedDevice(null)
        setDeviceId('')
        setState('scan')
        setErrorMessage('Die Verbindung zum Sensor wurde unterbrochen. Bitte wähle ihn erneut aus.')
      })
      setState('credentials')
    } catch {
      setSelectedDevice(null)
      setState('scan')
      setErrorMessage('Sensor konnte nicht verbunden werden. Bitte versuche es erneut.')
    }
  }

  const sendCredentials = async () => {
    if (!selectedDevice || !ssid.trim() || state === 'sending' || state === 'waiting') {
      return
    }

    setState('sending')
    setErrorMessage('')
    setCanRestartPairing(false)
    expectedDisconnect.current = true

    try {
      const payload = encode(JSON.stringify({ ssid: ssid.trim(), password }))
      await selectedDevice.writeCharacteristicWithResponseForService(
        PLANTY_SERVICE_UUID,
        WIFI_CREDENTIALS_UUID,
        payload,
      )

      setState('waiting')
      setErrorMessage('Dein Planty startet neu und verbindet sich mit dem WLAN.')

      const startedAt = Date.now()
      let pollingComplete = false
      const finishPolling = () => {
        pollingComplete = true
        if (pollTimer.current) clearTimeout(pollTimer.current)
        if (provisioningTimer.current) clearTimeout(provisioningTimer.current)
      }
      const poll = async () => {
        if (pollingComplete) {
          return
        }

        try {
          const result = await convex.query(api.sensors.isDeviceOnline, { device_id: deviceId })
          if (result.found) {
            finishPolling()
            try {
              await onProvisioned(deviceId)
              setState('success')
              setErrorMessage('')
            } catch {
              setState('credentials')
              setErrorMessage('Sensor konnte nicht registriert werden. Bitte versuche es erneut.')
            }
            return
          }
        } catch {
          // Keep polling through transient network/query failures.
        }

        if (Date.now() - startedAt >= PROVISIONING_TIMEOUT_MS) {
          finishPolling()
          setState('credentials')
          setCanRestartPairing(true)
          setErrorMessage('Dein Planty konnte nicht online gehen. Prüfe, ob das WLAN erreichbar ist und ob das WLAN-Passwort stimmt. Starte das Pairing danach neu.')
          return
        }

        pollTimer.current = setTimeout(() => void poll(), PROVISIONING_POLL_INTERVAL_MS)
      }

      pollTimer.current = setTimeout(() => void poll(), PROVISIONING_POLL_INTERVAL_MS)
      provisioningTimer.current = setTimeout(() => {
        if (pollingComplete) {
          return
        }
        finishPolling()
        setState('credentials')
        setCanRestartPairing(true)
        setErrorMessage('Dein Planty konnte nicht online gehen. Prüfe, ob das WLAN erreichbar ist und ob das WLAN-Passwort stimmt. Starte das Pairing danach neu.')
      }, PROVISIONING_TIMEOUT_MS)
    } catch {
      expectedDisconnect.current = false
      setState('credentials')
      setErrorMessage('WLAN-Zugangsdaten konnten nicht übertragen werden. Bitte versuche es erneut.')
    }
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
          <Text fontFamily="$body" color="$accent">WLAN eingerichtet. Sensor wird registriert.</Text>
        ) : state === 'waiting' ? (
          <YStack gap="$4">
            <Text fontFamily="$heading" fontSize={22} color="$textPrimary">
              Dein Planty ist unterwegs
            </Text>
            <Text fontFamily="$body" color="$textSecondary">
              Das Gerät startet neu und verbindet sich mit deinem WLAN. Gleich sollte es online sein.
            </Text>
            <Spinner color="$accent" />
          </YStack>
        ) : (
          <YStack gap="$12">
            <TextField label="WLAN-Name (SSID)" value={ssid} onChangeText={setSsid} autoCapitalize="none" />
            <TextField label="WLAN-Passwort" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
            {errorMessage ? <Text fontFamily="$body" color="$critical">{errorMessage}</Text> : null}
            <Button onPress={() => void sendCredentials()} loading={state === 'sending'} disabled={!ssid.trim()}>
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
            <Pressable key={device.id} onPress={() => void connectToDevice(device)} disabled={state !== 'scan'}>
              <XStack borderWidth={1} borderColor="$border" borderRadius="$8" padding="$12" justifyContent="space-between" alignItems="center">
                <YStack gap="$2">
                  <Text fontFamily="$body" fontWeight="700" color="$textPrimary">{getAdvertisedDeviceId(device)}</Text>
                  <Text fontFamily="$body" fontSize={12} color="$textSecondary">Planty BLE-Sensor</Text>
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
      {errorMessage.includes('Berechtigung') ? (
        <Button variant="secondary" onPress={() => void Linking.openSettings()}>
          Einstellungen öffnen
        </Button>
      ) : null}
      {state === 'connecting' ? <Spinner color="$accent" /> : null}
      {!errorMessage.includes('Berechtigung') ? (
        <Button variant="secondary" onPress={() => void startScan()}>
          Erneut suchen
        </Button>
      ) : null}
    </Card>
  )
}
