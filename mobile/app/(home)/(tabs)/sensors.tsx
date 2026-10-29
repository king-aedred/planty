import { HeaderIconButton } from '@/components/screens/detail-header'
import { SensorList } from '@/components/screens/sensor-list'
import { TabPage } from '@/components/screens/tab-page'
import { LoadingScreen } from '@/components/ui/loading-screen'
import { useGarden } from '@/hooks/use-garden'
import { useRouter } from 'expo-router'

// Sensoren (Tab): alle Sensoren mit Zustand; antippen öffnet das Sensor-Detail, Plus koppelt einen neuen.
export default function SensorsScreen() {
  const router = useRouter()
  const garden = useGarden()

  if (garden.isLoading) {
    return <LoadingScreen />
  }

  const free = garden.sensorViews.filter((sensor) => sensor.status === 'free').length
  const used = garden.sensorViews.length - free
  const pair = () => router.push('/(home)/add-sensor')

  return (
    <TabPage
      variant="brand"
      title="Sensoren"
      subtitle={garden.sensorViews.length > 0 ? `${used} im Einsatz${free > 0 ? ` · ${free} frei` : ''}` : undefined}
      action={<HeaderIconButton icon="add" label="Sensor koppeln" onPress={pair} accent />}
    >
      <SensorList
        sensors={garden.sensorViews}
        onOpen={(sensor) => router.push({ pathname: '/(home)/sensor', params: { device_id: sensor.deviceId ?? '' } })}
        onPair={pair}
      />
    </TabPage>
  )
}
