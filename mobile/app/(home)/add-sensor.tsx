import { api } from '../../../convex/_generated/api'
import { useMutation } from 'convex/react'
import { useRouter } from 'expo-router'
import { Alert, SafeAreaView, StyleSheet, Text, View } from 'react-native'
import BurgerMenu from '../../components/burger-menu'
import { BleProvisioning } from '../../components/onboarding/ble-provisioning'
import { Colors } from '@/constants/colors'

const colors = Colors.dark

export default function AddSensorScreen() {
  const router = useRouter()
  const claimSensor = useMutation(api.sensors.claimSensor)

  const handleProvisioned = async (deviceId: string) => {
    await claimSensor({ device_id: deviceId })
    Alert.alert(
      'Sensor ist bereit',
      'Möchtest du gleich eine Pflanze zuordnen?',
      [
        {
          text: 'Später',
          onPress: () => router.replace('/(home)/plant-list'),
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
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <BurgerMenu />
        <Text style={styles.eyebrow}>Planty</Text>
        <Text style={styles.title}>Sensor hinzufügen</Text>
        <Text style={styles.subtitle}>Stecke zuerst das USB-C-Kabel ein. Danach suchen wir deinen Sensor und richten das WLAN ein.</Text>
        <BleProvisioning onProvisioned={handleProvisioned} />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: 20, gap: 16, backgroundColor: colors.background },
  eyebrow: { color: colors.accent, textTransform: 'uppercase', letterSpacing: 2, fontSize: 12, fontWeight: '700' },
  title: { color: colors.text, fontSize: 32, fontWeight: '800', lineHeight: 38 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 22, maxWidth: 360 },
})
