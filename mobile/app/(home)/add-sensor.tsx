import { useRouter } from 'expo-router'
import { Alert } from 'react-native'
import { BleProvisioning } from '../../components/onboarding/ble-provisioning'
import { Screen } from '../../components/ui/screen'
import { ScreenHeader } from '../../components/ui/screen-header'

export default function AddSensorScreen() {
  const router = useRouter()
  const handleProvisioned = async (deviceId: string) => {
    Alert.alert(
      'Sensor ist bereit',
      'Möchtest du gleich eine Pflanze zuordnen?',
      [
        {
          text: 'Später',
          onPress: () => router.replace('/(home)/(tabs)/plant-list'),
        },
        {
          text: 'Pflanze zuordnen',
          onPress: () => router.replace({ pathname: '/(home)/add-plant', params: { device_id: deviceId } }),
        },
      ],
      { cancelable: false },
    )
  }

  return (
    <Screen scroll>
      <ScreenHeader
        eyebrow="Callgreen"
        title="Sensor koppeln"
        onBack={() => router.back()}
        withMenu={false}
        subtitle="Stecke zuerst das USB-C-Kabel ein. Danach suchen wir deinen Sensor und richten das WLAN ein."
      />
      <BleProvisioning onProvisioned={handleProvisioned} />
    </Screen>
  )
}
