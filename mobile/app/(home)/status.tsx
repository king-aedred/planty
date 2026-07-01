import { Colors } from '@/constants/colors'
import { api } from '../../../convex/_generated/api'
import BurgerMenu from '../../components/burger-menu'
import { useQuery } from 'convex/react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Circle } from '@shopify/react-native-skia'
import { CartesianChart, Line, useChartPressState } from 'victory-native'
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated'

const colors = Colors.dark
type SummaryState = 'ok' | 'low' | 'critical' | 'cold' | 'hot' | 'dark' | 'bright'
type MetricKey = 'moisture' | 'temperature' | 'light'
type PeriodPreset = '7' | '14' | 'custom'
type SensorStatusState = 'active' | 'inactive' | 'offline' | 'unknown'

const HISTORY_QUERY_FROM_DATE = '1970-01-01'

const METRIC_CONFIGS = {
  moisture: {
    emoji: '💧',
    label: 'Feuchtigkeit',
    unit: '%',
    lineColor: colors.success,
    domain: [0, 100] as [number, number],
    tickValues: [0, 25, 50, 75, 100],
    getValue: (summary: HistoricalSummary) => summary.moisture_median,
    formatValue: (value: number) => `${formatValue(value)}%`,
  },
  temperature: {
    emoji: '🌡️',
    label: 'Temperatur',
    unit: '°C',
    lineColor: '#FF9800',
    domain: [10, 35] as [number, number],
    tickValues: [10, 15, 20, 25, 30, 35],
    getValue: (summary: HistoricalSummary) => summary.temperature_median,
    formatValue: (value: number) => `${formatValue(value)}°C`,
  },
  light: {
    emoji: '☀️',
    label: 'Licht',
    unit: 'Lux',
    lineColor: '#2196F3',
    domain: [0, 2000] as [number, number],
    tickValues: [0, 500, 1000, 1500, 2000],
    getValue: (summary: HistoricalSummary) => summary.light_level_median,
    formatValue: (value: number) => `${formatValue(value)} Lux`,
  },
} satisfies Record<MetricKey, MetricConfig>

type HistoricalSummary = {
  date: string
  moisture_median: number
  temperature_median: number
  light_level_median: number
}

type ChartPoint = {
  day: string
  value: number
}

type TooltipState = {
  x: number
  y: number
  day: string
  value: number
} | null

type MetricConfig = {
  emoji: string
  label: string
  unit: string
  lineColor: string
  domain: [number, number]
  tickValues: number[]
  getValue: (summary: HistoricalSummary) => number
  formatValue: (value: number) => string
}

const formatDayLabel = (date: string) => {
  const parsedDate = new Date(`${date}T00:00:00Z`)

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
  }).format(parsedDate)
}

export default function StatusScreen() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user } = useUser()
  const router = useRouter()
  const params = useLocalSearchParams<{ plant_id?: string }>()
  const { width } = useWindowDimensions()

  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('moisture')
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodPreset>('7')
  const [customFromInput, setCustomFromInput] = useState('')
  const [customToInput, setCustomToInput] = useState('')
  const [appliedCustomRange, setAppliedCustomRange] = useState<{ from: string; to: string } | null>(null)

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
  const sensorStatus = useQuery(
    api.sensors.getSensorStatus,
    resolvedPlant.deviceId ? { device_id: resolvedPlant.deviceId } : 'skip',
  ) as
    | {
        status: SensorStatusState
        last_seen: number | null
        last_seen_formatted: string
      }
    | undefined
  const sensorStatusDisplay = resolvedPlant.deviceId
    ? sensorStatus
    : {
        status: 'unknown' as const,
        last_seen: null,
        last_seen_formatted: 'unbekannt',
      }
  const todayDate = getUtcDate()
  const chartWidth = width - 48
  const historyWindow = useMemo(() => ({ from: HISTORY_QUERY_FROM_DATE, to: todayDate }), [todayDate])
  const historicalSummaries = useQuery(
    api.plants.getHistoricalSummaries,
    resolvedPlant.deviceId ? { device_id: resolvedPlant.deviceId, from_date: historyWindow.from, to_date: historyWindow.to } : 'skip',
  )

  const sortedHistoricalSummaries = (historicalSummaries ?? []) as HistoricalSummary[]
  const earliestSummaryDate = sortedHistoricalSummaries[0]?.date ?? todayDate

  useEffect(() => {
    if (customFromInput || customToInput) {
      return
    }

    const defaultRange = getRelativeRange(todayDate, 7)
    setCustomFromInput(formatDisplayDate(defaultRange.from))
    setCustomToInput(formatDisplayDate(defaultRange.to))
  }, [customFromInput, customToInput, todayDate])

  const activeRange = useMemo(() => {
    if (selectedPeriod === '7') {
      return getRelativeRange(todayDate, 7)
    }

    if (selectedPeriod === '14') {
      return getRelativeRange(todayDate, 14)
    }

    if (appliedCustomRange) {
      return appliedCustomRange
    }

    return getRelativeRange(todayDate, 7)
  }, [appliedCustomRange, selectedPeriod, todayDate])

  const visibleSummaries = useMemo(
    () => sortedHistoricalSummaries.filter((summary) => summary.date >= activeRange.from && summary.date <= activeRange.to),
    [activeRange.from, activeRange.to, sortedHistoricalSummaries],
  )

  const activeMetricConfig = METRIC_CONFIGS[selectedMetric]
  const minCustomDate = earliestSummaryDate
  const maxCustomDate = todayDate
  const parsedCustomRange = parseDateRange(customFromInput, customToInput)
  const isCustomRangeValid =
    parsedCustomRange !== null && parsedCustomRange.from >= minCustomDate && parsedCustomRange.to <= maxCustomDate

  const chartData = useMemo<ChartPoint[]>(
    () =>
      visibleSummaries.map((summary) => ({
        day: formatDayLabel(summary.date),
        value: activeMetricConfig.getValue(summary),
      })),
    [activeMetricConfig, visibleSummaries],
  )

  const chartPress = useChartPressState({
    x: chartData[0]?.day ?? '',
    y: { value: chartData[0]?.value ?? 0 },
  })
  const [tooltipState, setTooltipState] = useState<TooltipState>(null)

  useEffect(() => {
    setTooltipState(null)
  }, [selectedMetric, activeRange.from, activeRange.to])

  useAnimatedReaction(
    () => ({
      active: chartPress.state.isActive.value,
      x: chartPress.state.x.position.value,
      y: chartPress.state.y.value.position.value,
      day: chartPress.state.x.value.value,
      value: chartPress.state.y.value.value,
    }),
    (current) => {
      if (!current.active || typeof current.day !== 'string' || !current.day || !Number.isFinite(current.value)) {
        runOnJS(setTooltipState)(null)
        return
      }

      runOnJS(setTooltipState)({
        x: Number(current.x),
        y: Number(current.y),
        day: current.day,
        value: Number(current.value),
      })
    },
    [chartPress, selectedMetric],
  )

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

  const handleApplyCustomRange = () => {
    if (!isCustomRangeValid || !parsedCustomRange) {
      return
    }

    setAppliedCustomRange(parsedCustomRange)
    setSelectedPeriod('custom')
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
                {sensorStatusDisplay ? (
                  <SensorStatusPill
                    status={sensorStatusDisplay.status}
                    lastSeenFormatted={sensorStatusDisplay.last_seen_formatted}
                  />
                ) : null}
              </View>
            </View>

            {resolvedPlant.deviceId ? (
              <>
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

                <View style={styles.chartCard}>
                  <View style={styles.chartHeader}>
                    <View style={styles.chartHeaderText}>
                      <Text style={styles.sectionTitle}>Historische Daten</Text>
                      <Text style={styles.sectionSubtitle}>
                        {selectedPeriod === 'custom'
                          ? `${formatDisplayDate(activeRange.from)} - ${formatDisplayDate(activeRange.to)}`
                          : selectedPeriod === '14'
                            ? 'Letzte 14 Tage'
                            : 'Letzte 7 Tage'}
                      </Text>
                    </View>
                    <Text style={styles.chartMeta}>{activeMetricConfig.unit}</Text>
                  </View>

                  <View style={styles.metricToggleRow}>
                    {(['moisture', 'temperature', 'light'] as MetricKey[]).map((metric) => {
                      const config = METRIC_CONFIGS[metric]
                      const isActive = selectedMetric === metric

                      return (
                        <Pressable
                          key={metric}
                          accessibilityRole="button"
                          style={({ pressed }) => [
                            styles.metricToggle,
                            isActive
                              ? [styles.metricToggleActive, { backgroundColor: config.lineColor, borderColor: config.lineColor }]
                              : styles.metricToggleInactive,
                            pressed && styles.metricTogglePressed,
                          ]}
                          onPress={() => setSelectedMetric(metric)}
                        >
                          <Text style={[styles.metricToggleText, isActive ? styles.metricToggleTextActive : styles.metricToggleTextInactive]}>
                            {config.emoji} {config.label}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>

                  <View style={styles.chartFrame}>
                    {visibleSummaries.length > 0 ? (
                      <View style={styles.chartCanvas}>
                        <CartesianChart
                          data={chartData}
                          xKey="day"
                          yKeys={['value']}
                          axisOptions={{
                            font: undefined,
                            tickCount: { x: 5, y: 5 },
                            labelColor: '#91A79B',
                            lineColor: colors.border,
                            formatXLabel: (value) => value,
                            formatYLabel: (value) => `${value}${activeMetricConfig.unit}`,
                          }}
                          domain={{ y: activeMetricConfig.domain }}
                          domainPadding={{ left: 10, right: 10, top: 20, bottom: 10 }}
                          chartPressState={chartPress.state}
                          explicitSize={{ width: chartWidth, height: 220 }}
                        >
                          {({ points }) => (
                            <>
                              <Line
                                points={points.value}
                                color={activeMetricConfig.lineColor}
                                strokeWidth={2}
                                animate={{ type: 'timing', duration: 300 }}
                              />
                              {points.value.map((point, index) => (
                                <Circle
                                  key={`${point.xValue}-${index}`}
                                  cx={point.x}
                                  cy={point.y ?? 0}
                                  r={4}
                                  color={activeMetricConfig.lineColor}
                                />
                              ))}
                            </>
                          )}
                        </CartesianChart>

                        {tooltipState ? (
                          <View
                            pointerEvents="none"
                            style={[
                              styles.chartTooltip,
                              {
                                left: clampNumber(tooltipState.x - 56, 8, chartWidth - 120),
                                top: clampNumber(tooltipState.y - 60, 8, 220 - 68),
                              },
                            ]}
                          >
                            <Text style={styles.chartTooltipValue}>{formatMetricTooltipValue(selectedMetric, tooltipState.value)}</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : (
                      <View style={styles.chartEmptyState}>
                        <Text style={styles.emptyStateTitle}>Noch keine historischen Daten.</Text>
                        <Text style={styles.emptyStateText}>
                          Nutze den Zeitreise Dev Mode um Testdaten zu erstellen.
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.periodToggleRow}>
                    {[
                      { key: '7' as const, label: '7 Tage' },
                      { key: '14' as const, label: '14 Tage' },
                    ].map((period) => {
                      const isActive = selectedPeriod === period.key

                      return (
                        <Pressable
                          key={period.key}
                          accessibilityRole="button"
                          style={({ pressed }) => [
                            styles.periodToggle,
                            isActive
                              ? [styles.periodToggleActive, { backgroundColor: colors.accent, borderColor: colors.accent }]
                              : styles.periodToggleInactive,
                            pressed && styles.metricTogglePressed,
                          ]}
                          onPress={() => {
                            setSelectedPeriod(period.key)
                          }}
                        >
                          <Text style={[styles.periodToggleText, isActive ? styles.periodToggleTextActive : styles.periodToggleTextInactive]}>
                            {period.label}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>

                  <View style={styles.customRangeBlock}>
                    <View style={styles.customRangeRow}>
                      <View style={styles.dateField}>
                        <Text style={styles.dateLabel}>Von:</Text>
                        <TextInput
                          value={customFromInput}
                          onChangeText={setCustomFromInput}
                          placeholder="DD.MM.YYYY"
                          placeholderTextColor={colors.muted}
                          keyboardType="numbers-and-punctuation"
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={styles.dateInput}
                        />
                      </View>
                      <View style={styles.dateField}>
                        <Text style={styles.dateLabel}>Bis:</Text>
                        <TextInput
                          value={customToInput}
                          onChangeText={setCustomToInput}
                          placeholder="DD.MM.YYYY"
                          placeholderTextColor={colors.muted}
                          keyboardType="numbers-and-punctuation"
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={styles.dateInput}
                        />
                      </View>
                    </View>

                    <Text style={styles.rangeHint}>
                      Verfügbar ab {formatDisplayDate(minCustomDate)} bis {formatDisplayDate(maxCustomDate)}
                    </Text>

                    <Pressable
                      accessibilityRole="button"
                      disabled={!isCustomRangeValid}
                      style={({ pressed }) => [
                        styles.applyButton,
                        !isCustomRangeValid && styles.applyButtonDisabled,
                        pressed && isCustomRangeValid && styles.applyButtonPressed,
                      ]}
                      onPress={handleApplyCustomRange}
                    >
                      <Text style={styles.applyButtonText}>Anwenden</Text>
                    </Pressable>
                  </View>
                </View>
              </>
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

function getUtcDate() {
  return new Date().toISOString().slice(0, 10)
}

function getRelativeRange(referenceDate: string, days: number) {
  const to = referenceDate
  const from = shiftUtcDate(referenceDate, -(days - 1))

  return { from, to }
}

function shiftUtcDate(referenceDate: string, offsetDays: number) {
  const date = new Date(`${referenceDate}T00:00:00Z`)

  if (Number.isNaN(date.getTime())) {
    return referenceDate
  }

  date.setUTCDate(date.getUTCDate() + offsetDays)

  return date.toISOString().slice(0, 10)
}

function formatDisplayDate(dateValue: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return dateValue
  }

  const date = new Date(`${dateValue}T00:00:00Z`)

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function formatChartDate(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00Z`)

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
  }).format(date)
}

function parseDateRange(fromInput: string, toInput: string) {
  const from = parseDisplayDate(fromInput)
  const to = parseDisplayDate(toInput)

  if (!from || !to || to < from) {
    return null
  }

  return { from, to }
}

function parseDisplayDate(value: string) {
  const trimmedValue = value.trim()
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmedValue)

  if (!match) {
    return null
  }

  const [, day, month, year] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))

  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null
  }

  return date.toISOString().slice(0, 10)
}

function formatMetricTooltipValue(metric: MetricKey, value: number) {
  if (metric === 'temperature') {
    return `${formatValue(value)}°C`
  }

  if (metric === 'light') {
    return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(value)} Lux`
  }

  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(value)}%`
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
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

function SensorStatusPill({
  status,
  lastSeenFormatted,
}: {
  status: SensorStatusState
  lastSeenFormatted: string
}) {
  const config = getSensorStatusConfig(status)
  const label =
    status === 'active'
      ? `Sensor aktiv · zuletzt ${lastSeenFormatted}`
      : status === 'inactive'
        ? `Sensor inaktiv · zuletzt ${lastSeenFormatted}`
        : status === 'offline'
          ? `Sensor offline · zuletzt ${lastSeenFormatted}`
          : 'Sensor Status unbekannt'

  return (
    <View style={[styles.sensorStatusPill, { backgroundColor: config.background, borderColor: config.border }]}> 
      <Text style={[styles.sensorStatusText, { color: config.text }]}>{config.emoji} {label}</Text>
    </View>
  )
}

function getSensorStatusConfig(status: SensorStatusState) {
  if (status === 'active') {
    return {
      emoji: '🟢',
      background: withAlpha(Colors.dark.success, 0.12),
      border: withAlpha(Colors.dark.success, 0.22),
      text: Colors.dark.success,
    }
  }

  if (status === 'inactive') {
    return {
      emoji: '🟡',
      background: withAlpha(Colors.dark.warning, 0.14),
      border: withAlpha(Colors.dark.warning, 0.24),
      text: Colors.dark.warning,
    }
  }

  if (status === 'offline') {
    return {
      emoji: '🔴',
      background: withAlpha(Colors.dark.critical, 0.14),
      border: withAlpha(Colors.dark.critical, 0.24),
      text: Colors.dark.critical,
    }
  }

  return {
    emoji: '❓',
    background: withAlpha(Colors.dark.muted, 0.12),
    border: withAlpha(Colors.dark.muted, 0.22),
    text: Colors.dark.muted,
  }
}

function withAlpha(hexColor: string, alpha: number) {
  const normalized = hexColor.replace('#', '')
  const value = normalized.length === 3
    ? normalized
        .split('')
        .map((character) => character + character)
        .join('')
    : normalized

  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
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
  sensorStatusPill: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 2,
  },
  sensorStatusText: {
    fontSize: 12,
    fontWeight: '700',
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
  chartCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 14,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  chartHeaderText: {
    gap: 4,
    flex: 1,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  chartMeta: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingTop: 2,
  },
  metricToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricToggle: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricToggleActive: {
    borderWidth: 1,
  },
  metricToggleInactive: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
  metricTogglePressed: {
    opacity: 0.86,
  },
  metricToggleText: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  metricToggleTextActive: {
    color: '#FFFFFF',
  },
  metricToggleTextInactive: {
    color: colors.text,
  },
  chartFrame: {
    minHeight: 220,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  chartCanvas: {
    position: 'relative',
  },
  chartEmptyState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  periodToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  periodToggle: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodToggleActive: {
    borderWidth: 1,
  },
  periodToggleInactive: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
  periodToggleText: {
    fontSize: 12,
    fontWeight: '800',
  },
  periodToggleTextActive: {
    color: '#FFFFFF',
  },
  periodToggleTextInactive: {
    color: colors.text,
  },
  customRangeBlock: {
    gap: 10,
  },
  customRangeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateField: {
    flex: 1,
    gap: 6,
  },
  dateLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  dateInput: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  rangeHint: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  applyButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  applyButtonDisabled: {
    opacity: 0.45,
  },
  applyButtonPressed: {
    opacity: 0.88,
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  chartTooltip: {
    position: 'absolute',
    minWidth: 118,
    maxWidth: 160,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  chartTooltipValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  chartTooltipDate: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
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