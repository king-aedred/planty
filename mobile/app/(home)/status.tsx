import { Colors } from '@/constants/colors'
import { api } from '../../../convex/_generated/api'
import BurgerMenu from '../../components/burger-menu'
import { useQuery } from 'convex/react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const colors = Colors.dark

type SummaryState = 'ok' | 'low' | 'critical' | 'cold' | 'hot' | 'dark' | 'bright'

export default function StatusScreen() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user } = useUser()
  const router = useRouter()
  const params = useLocalSearchParams<{ plant_id?: string }>()

  const clerkId = user?.id ?? ''
  const plants = useQuery(api.plants.getAllPlantsByClerkId, clerkId ? { clerk_id: clerkId } : 'skip')

  const resolvedPlant = useMemo(() => {
    const routePlantId = typeof params.plant_id === 'string' ? params.plant_id : ''

    const selectedPlant = routePlantId
      ? plants?.find((plant) => String(plant._id) === routePlantId)
      : plants?.[0]

    return {
      plantId: selectedPlant?._id ? String(selectedPlant._id) : routePlantId,
      name: selectedPlant?.name ?? 'Deine Pflanze',
      deviceId: selectedPlant?.device_id ?? selectedPlant?.sensor_id ?? null,
      latestSummary: selectedPlant?.latestSummary ?? null,
    }
  }, [params.plant_id, plants])

  const latestSummary = resolvedPlant.latestSummary

  const lastUpdatedText = latestSummary
    ? new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(latestSummary.created_at))
    : ''

  const handleOpenPlantSettings = () => {
    if (!resolvedPlant.plantId) {
      return
    }

    router.push({
      pathname: '/(home)/plant-settings',
      params: { plant_id: resolvedPlant.plantId },
    })
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.container}>
            <BurgerMenu deviceId={resolvedPlant.deviceId ?? undefined} />
            <View style={styles.headerRow}>
              <View style={styles.header}>
                <Text style={styles.eyebrow}>Planty Status</Text>
                <Text style={styles.title}>{resolvedPlant.name}</Text>
                <Text style={styles.deviceId}>{resolvedPlant.deviceId || 'Kein Sensor verbunden'}</Text>
              </View>
            </View>

            {resolvedPlant.deviceId ? (
              <View style={styles.cardGrid}>
                {latestSummary ? (
                  <>
                    <MetricCard
                      emoji="💧"
                      title="Feuchtigkeit"
                      value={`${formatValue(latestSummary.moisture_median)} %`}
                      badgeLabel={latestSummary.moisture_state}
                      badgeTone={moistureTone(latestSummary.moisture_state)}
                    />
                    <MetricCard
                      emoji="🌡️"
                      title="Temperatur"
                      value={`${formatValue(latestSummary.temperature_median)} °C`}
                      badgeLabel={latestSummary.temperature_state}
                      badgeTone={temperatureTone(latestSummary.temperature_state)}
                    />
                    <MetricCard
                      emoji="☀️"
                      title="Licht"
                      value={`${formatValue(latestSummary.light_level_median)} Lux`}
                      badgeLabel={latestSummary.light_state}
                      badgeTone={lightTone(latestSummary.light_state)}
                    />
                  </>
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateTitle}>Noch keine Daten</Text>
                    <Text style={styles.emptyStateText}>Noch keine Daten – warte auf ersten Sensor-Report</Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>Kein Sensor verbunden</Text>
                <Text style={styles.emptyStateText}>Du kannst dieser Pflanze später einen Sensor zuweisen.</Text>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.assignButton, pressed && styles.assignButtonPressed]}
                  onPress={() => router.push('/(home)/add-plant')}
                >
                  <Text style={styles.assignButtonText}>Sensor zuweisen</Text>
                </Pressable>
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.settingsButton, pressed && styles.settingsButtonPressed]}
              onPress={handleOpenPlantSettings}
              disabled={!resolvedPlant.plantId}
            >
              <Text style={styles.settingsButtonText}>⚙️ Pflanzen-Einstellungen</Text>
            </Pressable>

            <View style={styles.footer}>
              <Text style={styles.footerLabel}>Zuletzt aktualisiert</Text>
              <Text style={styles.footerValue}>{lastUpdatedText || 'Noch keine Daten'}</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function MetricCard({
  emoji,
  title,
  value,
  badgeLabel,
  badgeTone,
}: {
  emoji: string
  title: string
  value: string
  badgeLabel: string
  badgeTone: 'success' | 'warning' | 'critical'
}) {
  const badgeStyle =
    badgeTone === 'success'
      ? styles.badgeSuccess
      : badgeTone === 'warning'
        ? styles.badgeWarning
        : styles.badgeCritical

  const badgeTextStyle =
    badgeTone === 'success'
      ? styles.badgeSuccessText
      : badgeTone === 'warning'
        ? styles.badgeWarningText
        : styles.badgeCriticalText

  return (
    <View style={styles.card}>
      <Text style={styles.cardEmoji}>{emoji}</Text>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardValue}>{value}</Text>
      <View style={[styles.badge, badgeStyle]}>
        <Text style={[styles.badgeText, badgeTextStyle]}>{badgeLabel.toUpperCase()}</Text>
      </View>
    </View>
  )
}

function formatValue(value: number) {
  return new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: 1,
  }).format(value)
}

function moistureTone(state: SummaryState) {
  if (state === 'ok') {
    return 'success'
  }

  if (state === 'critical') {
    return 'critical'
  }

  return 'warning'
}

function temperatureTone(state: SummaryState) {
  if (state === 'ok') {
    return 'success'
  }

  if (state === 'hot') {
    return 'critical'
  }

  return 'warning'
}

function lightTone(state: SummaryState) {
  if (state === 'ok') {
    return 'success'
  }

  return 'warning'
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
    backgroundColor: colors.background,
    padding: 20,
    gap: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    paddingTop: 8,
  },
  header: {
    gap: 8,
    flex: 1,
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
  deviceId: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  settingsButton: {
    width: '100%',
    backgroundColor: 'transparent',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  settingsButtonPressed: {
    opacity: 0.84,
  },
  settingsButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  cardGrid: {
    gap: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    gap: 10,
  },
  cardEmoji: {
    fontSize: 22,
  },
  cardTitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardValue: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  badgeSuccess: {
    backgroundColor: colors.success,
  },
  badgeWarning: {
    backgroundColor: colors.warning,
  },
  badgeCritical: {
    backgroundColor: colors.critical,
  },
  badgeSuccessText: {
    color: colors.successText,
  },
  badgeWarningText: {
    color: colors.warningText,
  },
  badgeCriticalText: {
    color: colors.criticalText,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  emptyStateTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyStateText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  assignButton: {
    marginTop: 6,
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  assignButtonPressed: {
    opacity: 0.88,
  },
  assignButtonText: {
    color: colors.accentText,
    fontSize: 15,
    fontWeight: '700',
  },
  footer: {
    marginTop: 'auto',
    paddingBottom: 8,
    gap: 4,
  },
  footerLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  footerValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
})