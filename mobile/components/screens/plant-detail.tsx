import { PlantAvatar, type PlantStatusTone } from '@/components/plants/plant-avatar'
import type { DashboardPlant } from '@/components/plants/plant-dashboard'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { BatteryIndicator } from '@/components/ui/battery-indicator'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FadeIn } from '@/components/ui/fade-in'
import { SectionLabel } from '@/components/ui/section-label'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { type ComponentProps, useState } from 'react'
import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, useTheme, XStack, YStack } from 'tamagui'
import { type DemoMessage, type DemoSensor, type HistoryMetric, type HistoryRange } from './demo-data'
import { DetailHeader, HeaderIconButton } from './detail-header'
import { HistoryChart } from './history-chart'

type PlantDetailProps = {
  plant: DashboardPlant
  sensor: DemoSensor | null
  messages: DemoMessage[]
  history: (metric: HistoryMetric, range: HistoryRange) => number[]
  moistureTarget: number
  // Hinweis unter der Temperatur, z. B. „15–28 °C“.
  temperatureRange?: string
  onBack: () => void
  onOpenSettings: () => void
  onOpenSensor: () => void
  onPairSensor: () => void
  ignoreReducedMotion?: boolean
}

type Tone = PlantStatusTone

const TONE_TEXT: Record<Tone, string> = { success: '$success', warning: '$warning', critical: '$criticalText', neutral: '$textSecondary' }

function toneOf(state: string | undefined): Tone {
  if (state === 'critical' || state === 'hot') return 'critical'
  if (state && state !== 'ok') return 'warning'
  return 'success'
}

const METRICS: { value: HistoryMetric; label: string }[] = [
  { value: 'moisture', label: 'Feuchte' },
  { value: 'temperature', label: 'Temperatur' },
  { value: 'light', label: 'Licht' },
]
const RANGES: { value: HistoryRange; label: string; start: string }[] = [
  { value: '24h', label: '24 Std.', start: 'vor 24 Std.' },
  { value: '7d', label: '7 Tage', start: 'vor 7 Tagen' },
  { value: '30d', label: '30 Tage', start: 'vor 30 Tagen' },
]

function MetricTile({ icon, label, value, hint, tone }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; value: string; hint: string; tone: Tone }) {
  const theme = useTheme()
  return (
    <YStack flex={1} padding="$12" gap="$4" borderRadius="$12" backgroundColor="$surface" borderWidth={1} borderColor={tone === 'critical' ? '$critical' : '$border'}>
      <XStack alignItems="center" gap="$4">
        <Ionicons name={icon} size={14} color={theme.textSecondary?.val} />
        <Text fontFamily="$body" fontSize={11} color="$textSecondary">
          {label}
        </Text>
      </XStack>
      <Text fontFamily="$heading" fontSize={26} color={tone === 'success' ? '$textPrimary' : TONE_TEXT[tone]}>
        {value}
      </Text>
      <Text fontFamily="$body" fontSize={10} color="$textSecondary">
        {hint}
      </Text>
    </YStack>
  )
}

// Pflanzen-Detail (Screen 7): Bühne mit Stimmung und letzter Nachricht, Messwerte, Verlauf, Nachrichten, Sensor.
export function PlantDetailScreen({
  plant,
  sensor,
  messages,
  history,
  moistureTarget,
  temperatureRange = '15–28 °C',
  onBack,
  onOpenSettings,
  onOpenSensor,
  onPairSensor,
  ignoreReducedMotion,
}: PlantDetailProps) {
  const theme = useTheme()
  const [metric, setMetric] = useState<HistoryMetric>('moisture')
  const [range, setRange] = useState<HistoryRange>('24h')
  const summary = plant.summary
  const hasData = Boolean(sensor && summary)
  const moistureTone = hasData ? toneOf(summary?.moisture_state) : 'neutral'
  const overall: { tone: Tone; label: string } = !sensor
    ? { tone: 'neutral', label: 'Kein Sensor' }
    : moistureTone === 'critical'
      ? { tone: 'critical', label: 'Kritisch' }
      : moistureTone === 'warning'
        ? { tone: 'warning', label: 'Achtung' }
        : { tone: 'success', label: 'Alles gut' }
  const mood = overall.tone === 'critical' ? 'sad' : plant.character ?? 'neutral'
  const chartColor = { moisture: theme.accentText?.val, temperature: theme.warning?.val, light: theme.characterHappy?.val }[metric] ?? '#999'
  const unit = { moisture: '%', temperature: '°C', light: 'lx' }[metric]

  return (
    <YStack flex={1} backgroundColor="$background">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 40 }}>
          <DetailHeader title="" onBack={onBack} action={<HeaderIconButton icon="settings-outline" label="Pflanzen-Einstellungen" onPress={onOpenSettings} />} />

          <FadeIn duration={400} offset={10} ignoreReducedMotion={ignoreReducedMotion}>
            <YStack gap="$16">
              <XStack alignItems="center" gap="$16">
                <PlantAvatar mood={mood} status={overall.tone} size={88} />
                <YStack flex={1} gap="$4">
                  <Text fontFamily="$heading" fontSize={32} color="$textPrimary" numberOfLines={1}>
                    {plant.name}
                  </Text>
                  {plant.speciesName ? (
                    <Text fontFamily="$body" fontSize={13} color="$textSecondary">
                      {plant.speciesName}
                    </Text>
                  ) : null}
                  <XStack marginTop="$4">
                    <Badge tone={overall.tone as BadgeTone} label={overall.label} />
                  </XStack>
                </YStack>
              </XStack>

              {messages[0] ? (
                <YStack padding="$12" paddingHorizontal="$16" borderRadius="$16" borderTopLeftRadius="$4" backgroundColor={overall.tone === 'critical' ? '$criticalSoft' : '$surfaceElevated'}>
                  <Text fontFamily="$body" fontSize={17} lineHeight="$5" color="$textPrimary">
                    „{messages[0].text}“
                  </Text>
                  <Text fontFamily="$body" fontSize={11} color="$textSecondary" marginTop="$4">
                    {messages[0].time}
                  </Text>
                </YStack>
              ) : null}
            </YStack>
          </FadeIn>

          <FadeIn delay={80} duration={400} ignoreReducedMotion={ignoreReducedMotion}>
            <XStack gap="$8">
              <MetricTile
                icon="water"
                label="Boden"
                value={hasData ? `${summary?.moisture_median} %` : '–'}
                hint={`Ziel ab ${moistureTarget} %`}
                tone={moistureTone}
              />
              <MetricTile
                icon="thermometer"
                label="Temperatur"
                value={hasData && summary?.temperature_median !== undefined ? `${summary.temperature_median}°` : '–'}
                hint={temperatureRange}
                tone={hasData ? toneOf(summary?.temperature_state) : 'neutral'}
              />
              <MetricTile
                icon="sunny"
                label="Licht"
                value={hasData && summary?.light_level_median !== undefined ? `${summary.light_level_median}` : '–'}
                hint="Lux"
                tone={hasData ? toneOf(summary?.light_state) : 'neutral'}
              />
            </XStack>
          </FadeIn>

          <FadeIn delay={140} duration={400} ignoreReducedMotion={ignoreReducedMotion}>
            {hasData ? (
              <Card>
                <SectionLabel>Verlauf</SectionLabel>
                <SegmentedControl options={METRICS} value={metric} onChange={setMetric} />
                <HistoryChart
                  values={history(metric, range)}
                  color={chartColor}
                  unit={unit}
                  band={metric === 'moisture' ? { min: moistureTarget, max: 80 } : undefined}
                  startLabel={RANGES.find((entry) => entry.value === range)?.start ?? ''}
                  endLabel="jetzt"
                />
                <SegmentedControl options={RANGES.map(({ value, label }) => ({ value, label }))} value={range} onChange={setRange} />
              </Card>
            ) : (
              <Card>
                <YStack alignItems="center" gap="$8" paddingVertical="$8">
                  <Ionicons name="analytics-outline" size={28} color={theme.textSecondary?.val} />
                  <Text fontFamily="$body" fontSize={14} color="$textSecondary" textAlign="center">
                    Messwerte und Verlauf gibt es, sobald ein Sensor gekoppelt ist.
                  </Text>
                </YStack>
              </Card>
            )}
          </FadeIn>

          {messages.length > 0 ? (
            <FadeIn delay={200} duration={400} ignoreReducedMotion={ignoreReducedMotion}>
              <YStack gap="$8">
                <XStack justifyContent="space-between" alignItems="baseline">
                  <SectionLabel>{`Von ${plant.name}`}</SectionLabel>
                  <Text fontFamily="$body" fontSize={12} fontWeight="700" color="$accentText">
                    Alle
                  </Text>
                </XStack>
                <Card dense>
                  {messages.map((message, index) => (
                    <YStack key={message.id} padding="$12" gap="$2" borderTopWidth={index > 0 ? 1 : 0} borderColor="$border">
                      <Text fontFamily="$body" fontSize={14} color="$textPrimary">
                        {message.text}
                      </Text>
                      <Text fontFamily="$body" fontSize={11} color="$textSecondary">
                        {message.time}
                      </Text>
                    </YStack>
                  ))}
                </Card>
              </YStack>
            </FadeIn>
          ) : null}

          <FadeIn delay={260} duration={400} ignoreReducedMotion={ignoreReducedMotion}>
            <YStack gap="$8">
              <SectionLabel>Sensor</SectionLabel>
              {sensor ? (
                <XStack
                  role="button"
                  onPress={onOpenSensor}
                  gap="$12"
                  padding="$12"
                  alignItems="center"
                  borderRadius="$16"
                  backgroundColor="$surface press:$surfaceElevated"
                  borderWidth={1}
                  borderColor="$border"
                >
                  <YStack width={40} height={40} borderRadius="$12" backgroundColor="$surfaceElevated" alignItems="center" justifyContent="center">
                    <Ionicons name="radio-outline" size={20} color={theme.accentText?.val} />
                  </YStack>
                  <YStack flex={1} gap="$4">
                    <Text fontFamily="$body" fontWeight="600" fontSize={14} color="$textPrimary">
                      {sensor.name}
                    </Text>
                    <XStack gap="$12" alignItems="center">
                      <BatteryIndicator percent={sensor.battery} />
                      <MaterialCommunityIcons name="wifi" size={15} color={theme.textSecondary?.val} />
                      <Text fontFamily="$body" fontSize={12} color="$textSecondary">
                        {sensor.lastSeen}
                      </Text>
                    </XStack>
                  </YStack>
                  <Ionicons name="chevron-forward" size={16} color={theme.outlineVariant?.val} />
                </XStack>
              ) : (
                <Card>
                  <Text fontFamily="$body" fontSize={14} color="$textSecondary">
                    {plant.name} hat noch keinen Sensor.
                  </Text>
                  <Button onPress={onPairSensor}>Sensor koppeln</Button>
                </Card>
              )}
            </YStack>
          </FadeIn>
        </ScrollView>
      </SafeAreaView>
    </YStack>
  )
}
