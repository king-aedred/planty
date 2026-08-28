import { Colors } from '@/constants/colors'
import { api } from '../../../convex/_generated/api'
import BurgerMenu from '../../components/burger-menu'
import { useQuery } from 'convex/react'
import { useRouter } from 'expo-router'
import { useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const colors = Colors.dark

type SummaryState = 'ok' | 'warning' | 'critical' | 'cold' | 'hot' | 'dark' | 'bright'
type BadgeTone = 'success' | 'warning' | 'critical'

export default function PlantListScreen() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user } = useUser()
  const router = useRouter()
  const secretTapCountRef = useRef(0)
  const secretTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clerkId = user?.id ?? ''
  const plants = useQuery(api.plants.getAllPlantsByClerkId, clerkId ? { clerk_id: clerkId } : 'skip')
  const sensors = useQuery(api.sensors.getSensorsByClerkId, clerkId ? {} : 'skip')
  const unreadCount = useQuery(api.messages.getUnreadCount, clerkId ? { clerk_id: clerkId } : 'skip')

  const handleAddPlant = () => {
    router.push('/(home)/add-plant')
  }

  const handleAddSensor = () => {
    router.push('/(home)/add-sensor')
  }

  const handleAssignSensor = (deviceId: string) => {
    router.push({ pathname: '/(home)/add-plant', params: { device_id: deviceId } })
  }

  const handleOpenInbox = () => {
    router.push('/(home)/inbox')
  }

  const handleSecretHeaderTap = () => {
    secretTapCountRef.current += 1

    if (secretTapTimeoutRef.current) {
      clearTimeout(secretTapTimeoutRef.current)
    }

    secretTapTimeoutRef.current = setTimeout(() => {
      secretTapCountRef.current = 0
      secretTapTimeoutRef.current = null
    }, 900)

    if (secretTapCountRef.current >= 5) {
      secretTapCountRef.current = 0

      if (secretTapTimeoutRef.current) {
        clearTimeout(secretTapTimeoutRef.current)
        secretTapTimeoutRef.current = null
      }

      router.push('/demo-call')
    }
  }

  const handleOpenPlant = (plantId: string) => {
    router.push({
      pathname: '/(home)/status',
      params: { plant_id: plantId },
    })
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <BurgerMenu />

          <View style={styles.headerRow}>
            <View style={styles.inboxButtonWrapper}>
              <Pressable
                accessibilityRole="button"
                onPress={handleOpenInbox}
                style={({ pressed }) => [styles.inboxButton, pressed && styles.inboxButtonPressed]}
              >
                <Text style={styles.inboxIcon}>🔔</Text>
              </Pressable>

              {typeof unreadCount === 'number' && unreadCount > 0 ? (
                <View style={styles.inboxBadge}>
                  <Text style={styles.inboxBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              ) : null}
            </View>

            <Pressable accessibilityRole="button" onPress={handleSecretHeaderTap} style={styles.headerText}>
              <Text style={styles.eyebrow}>Planty</Text>
              <Text style={styles.title}>Mein Planty</Text>
            </Pressable>
          </View>

          <View style={styles.list}>
            {plants?.map((plant) => {
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
              })}
            {sensors?.filter((sensor) => !sensor.has_plant).map((sensor) => (
              <View key={String(sensor._id)} style={styles.sensorCard}>
                <View style={styles.cardTitleBlock}>
                  <Text style={styles.cardTitle}>Sensor {sensor.device_id}</Text>
                  <Text style={styles.sensorOpenStep}>Noch keiner Pflanze zugeordnet</Text>
                </View>
                <Text style={styles.summaryText}>Dein Sensor ist bereit für den nächsten Schritt.</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => handleAssignSensor(sensor.device_id)}
                  style={({ pressed }) => [styles.assignButton, pressed && styles.cardPressed]}
                >
                  <Text style={styles.assignButtonText}>Pflanze zuordnen</Text>
                </Pressable>
              </View>
            ))}
            {plants?.length === 0 && sensors?.filter((sensor) => !sensor.has_plant).length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>Dein Planty ist bereit</Text>
                <Text style={styles.emptyStateText}>Füge einen Sensor oder deine erste Pflanze hinzu.</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={handleAddSensor} style={({ pressed }) => [styles.addSensorButton, pressed && styles.addPlantButtonPressed]}>
              <Text style={styles.addPlantButtonText}>+ Sensor hinzufügen</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={handleAddPlant} style={({ pressed }) => [styles.addPlantButton, pressed && styles.addPlantButtonPressed]}>
              <Text style={styles.addPlantButtonText}>+ Pflanze hinzufügen</Text>
            </Pressable>
          </View>
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
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 16,
    paddingTop: 4,
  },
  inboxButtonWrapper: {
    position: 'relative',
    width: 44,
    height: 44,
  },
  inboxButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inboxButtonPressed: {
    opacity: 0.9,
  },
  inboxIcon: {
    fontSize: 18,
  },
  inboxBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.critical,
  },
  inboxBadgeText: {
    color: colors.criticalText,
    fontSize: 11,
    fontWeight: '800',
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
  sensorCard: {
    backgroundColor: '#10261D',
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 12,
  },
  sensorOpenStep: {
    color: colors.accent,
    fontSize: 14,
    lineHeight: 20,
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
  actions: {
    gap: 10,
  },
  addSensorButton: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  assignButton: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  assignButtonText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
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
