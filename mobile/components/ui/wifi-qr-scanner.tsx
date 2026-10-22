import { CameraView, useCameraPermissions } from 'expo-camera'
import { useState } from 'react'
import { Text, YStack } from 'tamagui'
import { Button } from './button'
import { Card } from './card'

type WifiCredentials = {
  ssid: string
  password: string
}

type WifiQrScannerProps = {
  onFound: (credentials: WifiCredentials) => void
  onClose: () => void
  onError: (message: string) => void
}

function parseWifiQr(value: string): WifiCredentials | null {
  if (!value.startsWith('WIFI:')) {
    return null
  }

  const fields: Record<string, string> = {}
  let currentKey = ''
  let currentValue = ''
  let escaped = false
  const commit = () => {
    if (currentKey) fields[currentKey] = currentValue
    currentKey = ''
    currentValue = ''
  }

  for (const character of `${value.slice(5)};`) {
    if (escaped) {
      currentValue += character
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (character === ':') {
      currentKey = currentValue
      currentValue = ''
    } else if (character === ';') {
      commit()
    } else {
      currentValue += character
    }
  }

  if (!fields.S || fields.P === undefined || !fields.S.trim()) {
    return null
  }

  return { ssid: fields.S, password: fields.P }
}

export function WifiQrScanner({ onFound, onClose, onError }: WifiQrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions()
  const [handled, setHandled] = useState(false)
  const [torchEnabled, setTorchEnabled] = useState(false)

  const openCamera = async () => {
    const result = permission?.granted ? permission : await requestPermission()
    if (!result.granted) {
      onError('Kamerazugriff wurde nicht erlaubt. Du kannst WLAN-Name und Passwort weiterhin manuell eingeben.')
    }
  }

  if (!permission?.granted) {
    return (
      <Card>
        <Text fontFamily="$heading" fontSize={24} lineHeight="$5" color="$textPrimary">
          WLAN-Code scannen
        </Text>
        <Text fontFamily="$body" fontSize={14} lineHeight="$4" color="$textSecondary">
          Erlaube den Kamerazugriff nur für diesen Scan des QR-Codes am Router.
        </Text>
        <Button onPress={() => void openCamera()}>Kamera öffnen</Button>
        <Button variant="ghost" onPress={onClose}>
          Manuell eingeben
        </Button>
      </Card>
    )
  }

  return (
    <Card>
      <YStack overflow="hidden" borderRadius="$8">
        <CameraView
          style={{ height: 240, width: '100%' }}
          facing="back"
          enableTorch={torchEnabled}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handled ? undefined : ({ data }) => {
            setHandled(true)
            const credentials = parseWifiQr(data)
            if (!credentials) {
              onError('Dieser QR-Code enthält keinen gültigen WLAN-Code. Gib die Daten bitte manuell ein.')
              return
            }
            onFound(credentials)
          }}
        />
      </YStack>
      <Text fontFamily="$body" fontSize={12} color="$textSecondary" textAlign="center">
        Richte den QR-Code am Router in den Rahmen.
      </Text>
      <Button variant="secondary" onPress={() => setTorchEnabled((current) => !current)}>
        {torchEnabled ? 'Taschenlampe ausschalten' : 'Taschenlampe einschalten'}
      </Button>
      <Button variant="ghost" onPress={onClose}>
        Zur manuellen Eingabe
      </Button>
    </Card>
  )
}
