import { DetailHeader } from '@/components/screens/detail-header'
import { Button } from '@/components/ui/button'
import { ChoiceCard } from '@/components/ui/choice-card'
import { FadeIn } from '@/components/ui/fade-in'
import { useGarden, deviceOf } from '@/hooks/use-garden'
import { useMutation } from 'convex/react'
import { type Href, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, YStack } from 'tamagui'
import type { Id } from '../../../convex/_generated/dataModel'
import { api } from '../../../convex/_generated/api'

// Freien Sensor einer Pflanze ohne Sensor zuordnen oder dafür eine neue Pflanze anlegen.
export default function AssignSensorScreen() {
  const router = useRouter()
  const { device_id: deviceId } = useLocalSearchParams<{ device_id: string }>()
  const garden = useGarden()
  const assignSensorToPlant = useMutation(api.plants.assignSensorToPlant)
  const [selected, setSelected] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const freePlants = (garden.plants ?? []).filter((plant) => !deviceOf(plant))

  const assign = async () => {
    if (!selected || !deviceId) return
    setError('')
    setIsSaving(true)
    try {
      await assignSensorToPlant({ plant_id: selected as Id<'plants'>, device_id: deviceId })
      router.back()
    } catch {
      setError('Das hat nicht geklappt. Versuch es noch mal.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <YStack flex={1} backgroundColor="$background">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 40 }}>
          <DetailHeader title="Sensor zuordnen" onBack={() => router.back()} />
          <FadeIn duration={400} offset={10}>
            <YStack gap="$8">
              {freePlants.length === 0 ? (
                <Text fontFamily="$body" fontSize={14} color="$textSecondary">
                  Alle deine Pflanzen haben schon einen Sensor.
                </Text>
              ) : (
                freePlants.map((plant) => (
                  <ChoiceCard
                    key={String(plant._id)}
                    title={plant.name}
                    description="Hat noch keinen Sensor"
                    selected={selected === String(plant._id)}
                    onPress={() => setSelected(String(plant._id))}
                  />
                ))
              )}
              {error ? (
                <Text fontFamily="$body" fontSize={12} color="$critical">
                  {error}
                </Text>
              ) : null}
              {freePlants.length > 0 ? (
                <Button onPress={() => void assign()} disabled={!selected} loading={isSaving}>
                  Zuordnen
                </Button>
              ) : null}
              <Button variant="secondary" onPress={() => router.replace({ pathname: '/(home)/add-plant', params: { device_id: deviceId } } as unknown as Href)}>
                Neue Pflanze dafür anlegen
              </Button>
            </YStack>
          </FadeIn>
        </ScrollView>
      </SafeAreaView>
    </YStack>
  )
}
