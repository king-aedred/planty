import { CameraView, useCameraPermissions } from 'expo-camera'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

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
      <View style={styles.panel}>
        <Text style={styles.title}>WLAN-Code scannen</Text>
        <Text style={styles.text}>Erlaube den Kamerazugriff nur für diesen Scan des QR-Codes am Router.</Text>
        <Pressable accessibilityRole="button" onPress={() => void openCamera()} style={styles.button}>
          <Text style={styles.buttonText}>Kamera öffnen</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>Manuell eingeben</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.panel}>
      <CameraView
        style={styles.camera}
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
      <Text style={styles.scanHint}>Richte den QR-Code am Router in den Rahmen.</Text>
      <Pressable accessibilityRole="button" onPress={() => setTorchEnabled((current) => !current)} style={styles.closeButton}>
        <Text style={styles.closeText}>{torchEnabled ? 'Taschenlampe ausschalten' : 'Taschenlampe einschalten'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
        <Text style={styles.closeText}>Zur manuellen Eingabe</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { gap: 12, overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: '#29483A', backgroundColor: '#10261D', padding: 12 },
  title: { color: '#F2F7F0', fontSize: 18, fontWeight: '800' },
  text: { color: '#A9BBAF', fontSize: 14, lineHeight: 20 },
  camera: { height: 240, width: '100%' },
  button: { alignItems: 'center', borderRadius: 10, backgroundColor: '#7FD38A', paddingVertical: 12 },
  buttonText: { color: '#07130F', fontWeight: '800' },
  closeButton: { alignItems: 'center', paddingVertical: 8 },
  closeText: { color: '#7FD38A', fontWeight: '700' },
  scanHint: { color: '#A9BBAF', fontSize: 12, textAlign: 'center' },
})
