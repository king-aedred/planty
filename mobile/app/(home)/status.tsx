import Ionicons from '@expo/vector-icons/Ionicons'
import { api } from '../../../convex/_generated/api'
import { Badge, type BadgeTone } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { EmptyState } from '../../components/ui/empty-state'
import { Screen } from '../../components/ui/screen'
import { ScreenHeader } from '../../components/ui/screen-header'
import { SectionLabel } from '../../components/ui/section-label'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { type DeviceState, StatusBadge } from '../../components/ui/status-badge'
import { BatteryIndicator } from '../../components/ui/battery-indicator'
import { TextField } from '../../components/ui/text-field'
import { useMutation, useQuery } from 'convex/react'
import { useDeviceCommand } from '@/hooks/use-device-command'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { type ComponentProps, useEffect, useMemo, useState } from 'react'
import { Alert, useWindowDimensions } from 'react-native'
import { Text, useTheme, XStack, YStack } from 'tamagui'
import { Circle } from '@shopify/react-native-skia'
import { CartesianChart, Line, useChartPressState } from 'victory-native'
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated'

type SummaryState = 'ok' | 'warning' | 'critical' | 'cold' | 'hot' | 'dark' | 'bright'
type MetricKey = 'moisture' | 'temperature' | 'light'
type PeriodPreset = '7' | '14' | 'custom'
type SensorStatusState = 'active' | 'inactive' | 'offline' | 'needs_remeasurement' | 'unknown'
type IconName = ComponentProps<typeof Ionicons>['name']

const HISTORY_QUERY_FROM_DATE = '1970-01-01'

// Linienfarben kommen aus dem Theme (chartMoisture, chartTemperature, chartLight).
const METRIC_CONFIGS = {
  moisture: {
    icon: 'water-outline',
    label: 'Feuchte',
    unit: '%',
    colorKey: 'chartMoisture',
    domain: [0, 100] as [number, number],
    tickValues: [0, 25, 50, 75, 100],
    getValue: (summary: HistoricalSummary) => summary.moisture_median,
    formatValue: (value: number) => `${formatValue(value)}%`,
  },
  temperature: {
    icon: 'thermometer-outline',
    label: 'Temperatur',
    unit: '°C',
    colorKey: 'chartTemperature',
    domain: [10, 35] as [number, number],
    tickValues: [10, 15, 20, 25, 30, 35],
    getValue: (summary: HistoricalSummary) => summary.temperature_median,
    formatValue: (value: number) => `${formatValue(value)}°C`,
  },
  light: {
    icon: 'sunny-outline',
    label: 'Licht',
    unit: 'Lux',
    colorKey: 'chartLight',
    domain: [0, 2000] as [number, number],
    tickValues: [0, 500, 1000, 1500, 2000],
    getValue: (summary: HistoricalSummary) => summary.light_level_median,
    formatValue: (value: number) => `${formatValue(value)} Lux`,
  },
} satisfies Record<MetricKey, MetricConfig>

// Temperatur und Licht fehlen, wenn der jeweilige Sensor ausgefallen ist.
type HistoricalSummary = {
  date: string
  moisture_median: number
  temperature_median?: number
  light_level_median?: number
}

// null: kein Wert an diesem Tag. Die Linie wird dort unterbrochen statt bei 0 gezeichnet.
type ChartPoint = {
  day: string
  value: number | null
}

type TooltipState = {
  x: number
  y: number
  day: string
  value: number
} | null

type MetricConfig = {
  icon: IconName
  label: string
  unit: string
  colorKey: 'chartMoisture' | 'chartTemperature' | 'chartLight'
  domain: [number, number]
  tickValues: number[]
  getValue: (summary: HistoricalSummary) => number | undefined
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
  const theme = useTheme()
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
        battery_pct?: number | null
        battery_charging?: boolean
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
  // Bildschirmrand 20 + Karteninnenabstand 16, je Seite
  const chartWidth = width - 72
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
        value: activeMetricConfig.getValue(summary) ?? null,
      })),
    [activeMetricConfig, visibleSummaries],
  )
  const hasChartValues = chartData.some((point) => point.value !== null)

  const chartPress = useChartPressState({
    x: chartData[0]?.day ?? '',
    y: { value: chartData.find((point) => point.value !== null)?.value ?? 0 },
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


  const lineColor = theme[activeMetricConfig.colorKey]?.val
  const periodLabel =
    selectedPeriod === 'custom'
      ? `${formatDisplayDate(activeRange.from)} – ${formatDisplayDate(activeRange.to)}`
      : selectedPeriod === '14'
        ? 'Letzte 14 Tage'
        : 'Letzte 7 Tage'

  return (
    <Screen scroll>
      <YStack gap="$8">
        <ScreenHeader eyebrow="Status" title={resolvedPlant.name} subtitle={resolvedPlant.deviceId || 'Kein Sensor verbunden'} onBack={() => router.back()} withMenu={false} />
        {sensorStatusDisplay ? (
          <XStack alignItems="center" justifyContent="space-between" gap="$8">
            <StatusBadge
              state={toDeviceState(sensorStatusDisplay.status)}
              label={sensorStatusLabel(sensorStatusDisplay.status, sensorStatusDisplay.last_seen_formatted)}
            />
            <BatteryIndicator percent={sensorStatusDisplay.battery_pct} charging={sensorStatusDisplay.battery_charging} />
          </XStack>
        ) : null}
      </YStack>

      {resolvedPlant.deviceId ? (
        <>
          {latestSummary ? (
            <XStack gap="$8">
              <MetricCard
                icon="water-outline"
                title="Feuchte"
                value={`${formatValue(latestSummary.moisture_median)} %`}
                badge={moistureBadge(latestSummary.moisture_state)}
              />
              {latestSummary.temperature_median !== undefined && latestSummary.temperature_state ? (
                <MetricCard
                  icon="thermometer-outline"
                  title="Temperatur"
                  value={`${formatValue(latestSummary.temperature_median)} °C`}
                  badge={temperatureBadge(latestSummary.temperature_state)}
                />
              ) : (
                <MetricCard icon="thermometer-outline" title="Temperatur" value="–" hint="Kein Wert vom Sensor" badge={{ tone: 'neutral', label: 'k. A.' }} />
              )}
              {latestSummary.light_level_median !== undefined && latestSummary.light_state ? (
                <MetricCard
                  icon="sunny-outline"
                  title="Licht"
                  value={`${formatValue(latestSummary.light_level_median)} lx`}
                  badge={lightBadge(latestSummary.light_state)}
                />
              ) : (
                <MetricCard icon="sunny-outline" title="Licht" value="–" hint="Kein Wert vom Sensor" badge={{ tone: 'neutral', label: 'k. A.' }} />
              )}
            </XStack>
          ) : (
            <Card>
              <EmptyState icon="hourglass-outline" title="Noch keine Daten" text="Sobald dein Sensor zum ersten Mal misst, siehst du hier die Werte." />
            </Card>
          )}

          <Card>
            <XStack alignItems="flex-end" justifyContent="space-between" gap="$8">
              <YStack gap="$2">
                <SectionLabel>Verlauf</SectionLabel>
                <Text fontFamily="$body" fontSize={13} color="$textSecondary">
                  {periodLabel}
                </Text>
              </YStack>
              <Text fontFamily="$body" fontSize={13} color="$textSecondary">
                {activeMetricConfig.unit}
              </Text>
            </XStack>

            <SegmentedControl
              options={(['moisture', 'temperature', 'light'] as MetricKey[]).map((metric) => ({ value: metric, label: METRIC_CONFIGS[metric].label }))}
              value={selectedMetric}
              onChange={setSelectedMetric}
            />

            <YStack minHeight={220} justifyContent="center">
              {visibleSummaries.length > 0 && hasChartValues ? (
                <YStack position="relative">
                  <CartesianChart
                    data={chartData}
                    xKey="day"
                    yKeys={['value']}
                    axisOptions={{
                      font: undefined,
                      tickCount: { x: 5, y: 5 },
                      labelColor: theme.textSecondary?.val,
                      lineColor: theme.border?.val,
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
                        {/* Fehlende Werte unterbrechen die Linie (feste y-Domain, keine Umskalierung). */}
                        <Line points={points.value} color={lineColor} strokeWidth={2} connectMissingData={false} animate={{ type: 'timing', duration: 300 }} />
                        {points.value.map((point, index) =>
                          typeof point.y === 'number' ? (
                            <Circle key={`${point.xValue}-${index}`} cx={point.x} cy={point.y} r={4} color={lineColor} />
                          ) : null,
                        )}
                      </>
                    )}
                  </CartesianChart>

                  {tooltipState ? (
                    <YStack
                      pointerEvents="none"
                      position="absolute"
                      left={clampNumber(tooltipState.x - 56, 8, chartWidth - 120)}
                      top={clampNumber(tooltipState.y - 60, 8, 220 - 68)}
                      backgroundColor="$surfaceElevated"
                      borderWidth={1}
                      borderColor="$borderStrong"
                      borderRadius="$8"
                      paddingVertical="$6"
                      paddingHorizontal="$12"
                    >
                      <Text fontFamily="$body" fontWeight="700" fontSize={14} color="$textPrimary">
                        {formatMetricTooltipValue(selectedMetric, tooltipState.value)}
                      </Text>
                    </YStack>
                  ) : null}
                </YStack>
              ) : visibleSummaries.length > 0 ? (
                <EmptyState icon="remove-circle-outline" title="Kein Wert vom Sensor" text={`In diesem Zeitraum hat dein Sensor keine Werte für ${activeMetricConfig.label} geliefert.`} />
              ) : (
                <EmptyState icon="analytics-outline" title="Noch kein Verlauf" text="Nutze die Zeitreise im Dev-Modus, um Testdaten zu erstellen." />
              )}
            </YStack>

            <SegmentedControl
              options={[
                { value: '7' as const, label: '7 Tage' },
                { value: '14' as const, label: '14 Tage' },
              ]}
              value={selectedPeriod === 'custom' ? null : selectedPeriod}
              onChange={(period) => setSelectedPeriod(period)}
            />

            <YStack gap="$8">
              <XStack gap="$8">
                <YStack flex={1}>
                  <TextField label="Von" value={customFromInput} onChangeText={setCustomFromInput} placeholder="TT.MM.JJJJ" keyboardType="numbers-and-punctuation" autoCapitalize="none" />
                </YStack>
                <YStack flex={1}>
                  <TextField label="Bis" value={customToInput} onChangeText={setCustomToInput} placeholder="TT.MM.JJJJ" keyboardType="numbers-and-punctuation" autoCapitalize="none" />
                </YStack>
              </XStack>
              <Text fontFamily="$body" fontSize={12} color="$textSecondary">
                Verfügbar vom {formatDisplayDate(minCustomDate)} bis {formatDisplayDate(maxCustomDate)}
              </Text>
              <Button variant="secondary" onPress={handleApplyCustomRange} disabled={!isCustomRangeValid}>
                Zeitraum anwenden
              </Button>
            </YStack>
          </Card>

          <SensorActions deviceId={resolvedPlant.deviceId} onRemoved={() => router.replace('/(home)/(tabs)/plant-list')} />
        </>
      ) : (
        <Card>
          <EmptyState
            icon="hardware-chip-outline"
            title="Kein Sensor verbunden"
            text="Du kannst dieser Pflanze später einen Sensor zuweisen."
            action={{ label: 'Sensor zuweisen', onPress: () => router.push('/(home)/add-plant') }}
          />
        </Card>
      )}

      <Button variant="secondary" onPress={handleOpenPlantSettings} disabled={!resolvedPlant.plantId}>
        Pflanzen-Einstellungen
      </Button>

      <Text fontFamily="$body" fontSize={12} color="$textSecondary" textAlign="center">
        Zuletzt aktualisiert: {lastUpdatedText || 'noch keine Daten'}
      </Text>
    </Screen>
  )
}

type ActionMessage = { tone: 'success' | 'info' | 'error'; text: string } | null

// Bereich "Sensor": Befehle an den Sensor (Backend convex/device_commands.ts) und Entfernen.
// Das WLAN-Passwort bleibt nur im Formular-State, wird nach dem Absenden geleert und nie geloggt.
function SensorActions({ deviceId, onRemoved }: { deviceId: string; onRemoved: () => void }) {
  const requestMeasureNow = useMutation(api.device_commands.requestMeasureNow)
  const requestSetWifi = useMutation(api.device_commands.requestSetWifi)
  const requestFactoryReset = useMutation(api.device_commands.requestFactoryReset)
  const removeSensor = useMutation(api.device_commands.removeSensor)
  const command = useDeviceCommand()
  const [activeAction, setActiveAction] = useState<'measure' | 'wifi' | 'reset' | 'remove' | null>(null)
  const [message, setMessage] = useState<ActionMessage>(null)
  const [isWifiFormOpen, setIsWifiFormOpen] = useState(false)
  const [wifiSsid, setWifiSsid] = useState('')
  const [wifiPassword, setWifiPassword] = useState('')

  const isBusy = activeAction !== null

  const handleMeasureNow = async () => {
    setActiveAction('measure')
    setMessage({ tone: 'info', text: 'Auftrag wird an deinen Sensor geschickt …' })
    const outcome = await command.run(() => requestMeasureNow({ device_id: deviceId }))
    setActiveAction(null)

    if (outcome.kind === 'ok') {
      setMessage({ tone: 'success', text: 'Dein Sensor hat gerade gemessen. Die neuen Werte erscheinen gleich.' })
    } else if (outcome.kind === 'waiting') {
      setMessage({
        tone: 'info',
        text: 'Der Auftrag liegt für deinen Sensor bereit. Läuft er am Akku, holt er ihn erst beim nächsten Messen ab, das kann bis zu einer Stunde dauern. Am USB geht es sofort.',
      })
    } else if (outcome.kind === 'failed' || outcome.kind === 'expired' || outcome.kind === 'error') {
      setMessage({ tone: 'error', text: outcome.message })
    } else {
      setMessage(null)
    }
  }

  const handleSubmitWifi = async () => {
    const ssid = wifiSsid.trim()
    const password = wifiPassword
    if (!ssid) return
    // Passwort sofort aus dem State nehmen; es lebt nur noch in diesem Aufruf.
    setWifiPassword('')
    setIsWifiFormOpen(false)
    setActiveAction('wifi')
    setMessage({ tone: 'info', text: 'Die neuen WLAN-Daten werden an deinen Sensor geschickt …' })
    const outcome = await command.run(() => requestSetWifi({ device_id: deviceId, ssid, password }))
    setActiveAction(null)

    if (outcome.kind === 'ok') {
      setMessage({ tone: 'success', text: `Dein Sensor ist jetzt mit „${ssid}“ verbunden.` })
      setWifiSsid('')
    } else if (outcome.kind === 'waiting') {
      setMessage({
        tone: 'info',
        text: 'Der Auftrag liegt für deinen Sensor bereit. Läuft er am Akku, holt er ihn erst beim nächsten Messen ab. Passiert das nicht innerhalb von 10 Minuten, verfällt der Auftrag, und du kannst es noch einmal versuchen. Am USB geht es sofort.',
      })
    } else if (outcome.kind === 'failed' || outcome.kind === 'expired') {
      setMessage({ tone: 'error', text: outcome.message })
      // Falsches Passwort: Formular wieder öffnen, damit du es gleich korrigieren kannst.
      if (outcome.kind === 'failed' && outcome.detail === 'auth_failed') setIsWifiFormOpen(true)
    } else if (outcome.kind === 'error') {
      setMessage({ tone: 'error', text: outcome.message })
    } else {
      setMessage(null)
    }
  }

  // Werkseinstellungen: Sensor löscht WLAN-Daten und Token, das Backend löst ihn danach aus dem Konto
  // (wie "Sensor entfernen"). Geht nur, wenn der Sensor den Auftrag abholen kann.
  const handleFactoryReset = () => {
    Alert.alert(
      'Auf Werkseinstellungen zurücksetzen?',
      'Dein Sensor vergisst sein WLAN und wird aus deinem Konto entfernt. Pflanzen, die ihm zugeordnet sind, werden gelöst. Danach kannst du ihn neu einrichten oder weitergeben.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Zurücksetzen',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setActiveAction('reset')
              setMessage({ tone: 'info', text: 'Auftrag wird an deinen Sensor geschickt …' })
              const outcome = await command.run(() => requestFactoryReset({ device_id: deviceId }))
              setActiveAction(null)

              if (outcome.kind === 'ok') {
                onRemoved()
              } else if (outcome.kind === 'waiting') {
                setMessage({
                  tone: 'info',
                  text: 'Der Auftrag liegt für deinen Sensor bereit. Läuft er am Akku, holt er ihn erst beim nächsten Messen ab, das kann bis zu einer Stunde dauern. Am USB geht es sofort. Danach verschwindet er aus deinem Konto.',
                })
              } else if (outcome.kind === 'failed' || outcome.kind === 'expired' || outcome.kind === 'error') {
                setMessage({ tone: 'error', text: outcome.message })
              } else {
                setMessage(null)
              }
            })()
          },
        },
      ],
    )
  }

  const handleRemove = () => {
    Alert.alert(
      'Sensor entfernen?',
      'Der Sensor wird aus deinem Konto entfernt. Pflanzen, die ihm zugeordnet sind, werden gelöst. Wenn du ihn wieder nutzen willst, musst du ihn neu einrichten: per USB einstecken und über „Sensor hinzufügen“ koppeln.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Entfernen',
          style: 'destructive',
          onPress: () => {
            command.cancel()
            setActiveAction('remove')
            void removeSensor({ device_id: deviceId })
              .then(onRemoved)
              .catch(() => {
                setActiveAction(null)
                Alert.alert('Entfernen nicht möglich', 'Der Sensor konnte gerade nicht entfernt werden. Prüfe deine Verbindung und versuch es erneut.')
              })
          },
        },
      ],
    )
  }


  return (
    <Card>
      <SectionLabel>Sensor</SectionLabel>

      <Button variant="secondary" disabled={isBusy} onPress={() => void handleMeasureNow()}>
        {activeAction === 'measure' ? 'Wird aktualisiert …' : 'Jetzt aktualisieren'}
      </Button>

      <Button variant="secondary" disabled={isBusy} onPress={() => setIsWifiFormOpen((open) => !open)}>
        {activeAction === 'wifi' ? 'WLAN wird geändert …' : 'WLAN ändern'}
      </Button>

      {isWifiFormOpen ? (
        <YStack gap="$12" paddingTop="$4">
          <Text fontFamily="$body" fontSize={13} lineHeight="$3" color="$textSecondary">
            Das geht nur, solange dein Sensor noch im alten WLAN online ist. Ist das alte WLAN schon weg, richte ihn per USB neu ein: „Sensor hinzufügen“ in der Pflanzenliste.
          </Text>
          <TextField label="Neues WLAN (SSID)" value={wifiSsid} onChangeText={setWifiSsid} placeholder="WLAN-Name" autoCapitalize="none" autoComplete="off" />
          <TextField
            label="WLAN-Passwort"
            value={wifiPassword}
            onChangeText={setWifiPassword}
            placeholder="Passwort"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
          />
          <Button onPress={() => void handleSubmitWifi()} disabled={!wifiSsid.trim() || isBusy}>
            WLAN übernehmen
          </Button>
        </YStack>
      ) : null}

      {message ? (
        <Text
          fontFamily="$body"
          fontSize={14}
          lineHeight="$4"
          color={message.tone === 'success' ? '$success' : message.tone === 'error' ? '$critical' : '$textSecondary'}
        >
          {message.text}
        </Text>
      ) : null}

      <Button variant="secondary" disabled={isBusy} onPress={handleFactoryReset}>
        {activeAction === 'reset' ? 'Wird zurückgesetzt …' : 'Auf Werkseinstellungen zurücksetzen'}
      </Button>

      <Button variant="danger" disabled={activeAction === 'remove'} onPress={handleRemove}>
        {activeAction === 'remove' ? 'Wird entfernt …' : 'Sensor entfernen'}
      </Button>
    </Card>
  )
}

function MetricCard({
  icon,
  title,
  value,
  hint,
  badge,
}: {
  icon: IconName
  title: string
  value: string
  hint?: string
  badge: { tone: BadgeTone; label: string }
}) {
  const theme = useTheme()
  const isEmpty = badge.tone === 'neutral'

  return (
    <YStack flex={1} backgroundColor="$surface" borderWidth={1} borderColor="$border" borderRadius="$16" padding="$12" gap="$8">
      <XStack alignItems="center" gap="$4">
        <Ionicons name={icon} size={16} color={theme.textSecondary?.val} />
        <Text fontFamily="$body" fontSize={12} color="$textSecondary" numberOfLines={1}>
          {title}
        </Text>
      </XStack>
      <Text fontFamily="$heading" fontSize={24} color={isEmpty ? '$textSecondary' : '$textPrimary'} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? (
        <Text fontFamily="$body" fontSize={11} color="$textSecondary">
          {hint}
        </Text>
      ) : null}
      <Badge tone={badge.tone} label={badge.label} dot={false} />
    </YStack>
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

function moistureBadge(state: SummaryState): { tone: BadgeTone; label: string } {
  if (state === 'ok') return { tone: 'success', label: 'Gut' }
  if (state === 'critical') return { tone: 'critical', label: 'Durstig' }
  return { tone: 'warning', label: 'Etwas trocken' }
}

function temperatureBadge(state: SummaryState): { tone: BadgeTone; label: string } {
  if (state === 'ok') return { tone: 'success', label: 'Gut' }
  if (state === 'hot') return { tone: 'critical', label: 'Zu warm' }
  return { tone: 'warning', label: 'Zu kalt' }
}

function lightBadge(state: SummaryState): { tone: BadgeTone; label: string } {
  if (state === 'ok') return { tone: 'success', label: 'Gut' }
  if (state === 'bright') return { tone: 'warning', label: 'Zu hell' }
  return { tone: 'warning', label: 'Zu dunkel' }
}

function toDeviceState(status: SensorStatusState): DeviceState {
  if (status === 'active' || status === 'offline' || status === 'needs_remeasurement') return status
  if (status === 'inactive') return 'offline'
  return 'unknown'
}

function sensorStatusLabel(status: SensorStatusState, lastSeen: string) {
  if (status === 'needs_remeasurement') return 'Sensor braucht eine neue Messung'
  if (status === 'active') return `Aktiv · zuletzt ${lastSeen}`
  if (status === 'inactive') return `Inaktiv · zuletzt ${lastSeen}`
  if (status === 'offline') return `Offline · zuletzt ${lastSeen}`
  return 'Status unbekannt'
}
