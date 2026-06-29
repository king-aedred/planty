import { Colors } from '@/constants/colors'
import { api } from '../../../convex/_generated/api'
import BurgerMenu from '../../components/burger-menu'
import { useQuery } from 'convex/react'
import { useRouter } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const colors = Colors.dark

type SummaryState = 'ok' | 'low' | 'critical' | 'cold' | 'hot' | 'dark' | 'bright'
type BadgeTone = 'success' | 'warning' | 'critical'

export default function PlantListScreen() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user } = useUser()
  const router = useRouter()

  const clerkId = user?.id ?? ''
  const plants = useQuery(api.plants.getAllPlantsByClerkId, clerkId ? { clerk_id: clerkId } : 'skip')

  const handleAddPlant = () => {
    router.push('/(home)/add-plant')
  }

  const handleOpenPlant = (plantId: string) => {
    router.push({
      pathname: '/(home)/status',
      params: { plant_id: plantId },
    })
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <BurgerMenu />

          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>Planty</Text>
              <Text style={styles.title}>Meine Pflanzen</Text>
            </View>
          </View>

          <View style={styles.list}>
            {plants && plants.length > 0 ? (
              plants.map((plant) => {
                const latestSummary = plant.latestSummary ?? null
                const plantId = String(plant._id)
                const deviceId = plant.device_id ?? plant.sensor_id ?? null

                return (
                  <Pressable
                    key={plantId}
                    accessibilityRole="button"
                    onPress={() => handleOpenPlant(plantId)}
                    style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                  >
                    <View style={styles.cardTopRow}>
                      <View style={styles.cardTitleBlock}>
                        <Text style={styles.cardTitle}>{plant.name}</Text>
                        <Text style={deviceId ? styles.deviceId : styles.deviceIdMuted}>
                          {deviceId || 'Kein Sensor verbunden'}
                        </Text>
                      </View>

                      <StatusBadge tone={getOverallTone(latestSummary)} label={getOverallLabel(latestSummary)} />
                    </View>

                    <Text style={styles.summaryText}>
                      {latestSummary
                        ? `Letzte Messung: ${formatSummaryTime(latestSummary.created_at)}`
                        : 'Noch keine Daten'}
                    </Text>
                  </Pressable>
                )
              })
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>Noch keine Pflanzen</Text>
                <Text style={styles.emptyStateText}>
                  Lege deine erste Pflanze an oder verbinde einen Sensor später.
                </Text>
              </View>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={handleAddPlant}
            style={({ pressed }) => [styles.addPlantButton, pressed && styles.addPlantButtonPressed]}
          >
            <Text style={styles.addPlantButtonText}>+ Pflanze hinzufügen</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function StatusBadge({ tone, label }: { tone: BadgeTone; label: string }) {
  const badgeStyle =
    tone === 'success' ? styles.badgeSuccess : tone === 'warning' ? styles.badgeWarning : styles.badgeCritical

  const badgeTextStyle =
    tone === 'success'
      ? styles.badgeSuccessText
      : tone === 'warning'
        ? styles.badgeWarningText
        : styles.badgeCriticalText

  return (
    <View style={[styles.badge, badgeStyle]}>
      <Text style={[styles.badgeText, badgeTextStyle]}>{label}</Text>
    </View>
  )
}

function getOverallTone(summary: {
  moisture_state: SummaryState
  temperature_state: SummaryState
  light_state: SummaryState
} | null) {
  if (!summary) {
    return 'warning'
  }

  if (summary.moisture_state === 'critical' || summary.temperature_state === 'hot') {
    return 'critical'
  }

  if (
    summary.moisture_state !== 'ok' ||
    summary.temperature_state !== 'ok' ||
    summary.light_state !== 'ok'
  ) {
    return 'warning'
  }

  return 'success'
}

function getOverallLabel(summary: {
  moisture_state: SummaryState
  temperature_state: SummaryState
  light_state: SummaryState
} | null) {
  if (!summary) {
    return 'NO DATA'
  }

  const tone = getOverallTone(summary)

  if (tone === 'critical') {
    return 'CRITICAL'
  }

  if (tone === 'warning') {
    return 'WARNING'
  }

  return 'OK'
}

function formatSummaryTime(timestamp: number) {
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    padding: 20,
    gap: 20,
    backgroundColor: colors.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    paddingTop: 4,
  },
  headerText: {
    flex: 1,
    gap: 8,
  },
  eyebrow: {
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
  },
  list: {
    gap: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 12,
  },
  cardPressed: {
    opacity: 0.9,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardTitleBlock: {
    flex: 1,
    gap: 6,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
  },
  deviceId: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  deviceIdMuted: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  summaryText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  badgeSuccess: {
    backgroundColor: '#16321E',
  },
  badgeWarning: {
    backgroundColor: '#3B270C',
  },
  badgeCritical: {
    backgroundColor: '#3A1111',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  badgeSuccessText: {
    color: colors.success,
  },
  badgeWarningText: {
    color: colors.warning,
  },
  badgeCriticalText: {
    color: colors.critical,
  },
  emptyState: {
    marginTop: 12,
    padding: 20,
    borderRadius: 24,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
    gap: 10,
    alignItems: 'center',
  },
  emptyStateTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  emptyStateText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  addPlantButton: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  addPlantButtonPressed: {
    opacity: 0.84,
  },
  addPlantButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
})
