import { PlantSettingsScreen } from '@/components/screens/plant-settings'
import { LoadingScreen } from '@/components/ui/loading-screen'
import { deviceOf, useGarden } from '@/hooks/use-garden'
import { useSpeciesSearch } from '@/hooks/use-species-search'
import { useMutation } from 'convex/react'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { api } from '../../../convex/_generated/api'

// Pflanzen-Einstellungen (Screen 8) mit echten Daten.
export default function PlantSettingsRoute() {
  const router = useRouter()
  const { plant_id: plantId } = useLocalSearchParams<{ plant_id: string }>()
  const garden = useGarden()
  const updatePlantSettings = useMutation(api.plants.updatePlantSettings)
  const updatePlantCharacter = useMutation(api.plants.updatePlantCharacter)
  const deletePlant = useMutation(api.plants.deletePlant)
  const removeSensorFromPlant = useMutation(api.plants.removeSensorFromPlant)

  const plant = garden.plants?.find((entry) => String(entry._id) === plantId)
  const dashboardPlant = garden.dashboardPlants.find((entry) => entry.id === plantId)

  if (garden.isLoading) {
    return <LoadingScreen />
  }
  if (!plant || !dashboardPlant) {
    return <Redirect href="/(home)/(tabs)/plant-list" />
  }

  const deviceId = deviceOf(plant)
  const sensor = deviceId ? garden.sensorViews.find((entry) => entry.deviceId === deviceId) ?? null : null

  return (
    <PlantSettingsScreen
      plant={dashboardPlant}
      sensor={sensor}
      thresholds={{
        moisture: plant.moisture_threshold ?? 30,
        temperatureMin: plant.temperature_threshold_min ?? 15,
        temperatureMax: plant.temperature_threshold_max ?? 30,
        lightMin: plant.light_threshold_min ?? 150,
        lightMax: plant.light_threshold_max ?? 800,
      }}
      useSpeciesSearch={useSpeciesSearch}
      onBack={() => router.back()}
      onSave={async (values) => {
        try {
          await updatePlantSettings({
            plant_id: plant._id,
            settings: {
              name: values.name,
              ...(values.speciesChanged && values.species ? { species_id: values.species.id } : {}),
              moisture_threshold: values.thresholds.moisture,
              temperature_threshold_min: values.thresholds.temperatureMin,
              temperature_threshold_max: values.thresholds.temperatureMax,
              light_threshold_min: values.thresholds.lightMin,
              light_threshold_max: values.thresholds.lightMax,
            },
          })
          if (values.character !== plant.character) {
            await updatePlantCharacter({ plant_id: plant._id, character: values.character })
          }
          router.back()
          return null
        } catch {
          return 'Speichern hat nicht geklappt. Versuch es noch mal.'
        }
      }}
      onDelete={async () => {
        await deletePlant({ plant_id: plant._id })
        router.replace('/(home)/(tabs)/plant-list')
      }}
      onPairSensor={() => router.push('/(home)/add-sensor')}
      onRemoveSensor={async () => {
        await removeSensorFromPlant({ plant_id: plant._id })
      }}
    />
  )
}
