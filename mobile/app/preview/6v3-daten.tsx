import { DEMO_MOISTURE_HISTORY, DEMO_PLANTS, demoTone, type DemoTone } from '@/components/plants/dashboard-demo'
import { PlantAvatar } from '@/components/plants/plant-avatar'
import { FadeIn } from '@/components/ui/fade-in'
import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { Text, useTheme, XStack, YStack } from 'tamagui'

// Variante 3 „Daten“: Übersicht als leuchtender Ring (Anteil gut / Achtung / kritisch), darunter je Pflanze eine
// große Feuchte-Zahl, Verlaufslinie der letzten 24 Messungen und ein Balken mit Zielbereich.

type ThemeColors = Record<string, { val: string } | undefined>

function toneHex(theme: ThemeColors, tone: DemoTone) {
  const key = { success: 'success', warning: 'warning', critical: 'criticalText', neutral: 'outline' }[tone]
  return theme[key]?.val ?? '#888'
}

function OverviewRing({ counts, theme }: { counts: Record<DemoTone, number>; theme: ThemeColors }) {
  const size = 150
  const stroke = 12
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const total = counts.success + counts.warning + counts.critical + counts.neutral
  let offset = 0
  const segments = (['success', 'warning', 'critical', 'neutral'] as DemoTone[]).map((tone) => {
    const length = (counts[tone] / total) * circumference
    const segment = { tone, length, offset }
    offset += length
    return segment
  })
  return (
    <YStack width={size} height={size} alignItems="center" justifyContent="center">
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        {segments.map((segment) =>
          segment.length > 0 ? (
            <Circle
              key={segment.tone}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={toneHex(theme, segment.tone)}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${Math.max(segment.length - 4, 0)} ${circumference}`}
              strokeDashoffset={-segment.offset}
              strokeLinecap="round"
            />
          ) : null,
        )}
      </Svg>
      <Text fontFamily="$heading" fontSize={44} color="$textPrimary">
        {counts.success}/{total}
      </Text>
      <Text fontFamily="$body" fontSize={11} letterSpacing={1} textTransform="uppercase" color="$textSecondary">
        glücklich
      </Text>
    </YStack>
  )
}

function Sparkline({ values, color, id }: { values: number[]; color: string; id: string }) {
  const width = 120
  const height = 36
  const min = Math.min(...values) - 2
  const max = Math.max(...values) + 2
  const points = values.map((value, index) => [(index / (values.length - 1)) * width, height - ((value - min) / (max - min)) * height])
  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.35} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={area} fill={`url(#${id})`} />
      <Path d={line} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export default function DataVariant() {
  const theme = useTheme() as unknown as ThemeColors
  const counts: Record<DemoTone, number> = { success: 0, warning: 0, critical: 0, neutral: 0 }
  DEMO_PLANTS.forEach((plant) => {
    counts[demoTone(plant)] += 1
  })

  return (
    <YStack flex={1} backgroundColor="$background">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <FadeIn ignoreReducedMotion>
            <XStack padding="$16" gap="$16" alignItems="center" borderRadius="$16" backgroundColor="$surface" borderWidth={1} borderColor="$border">
              <OverviewRing counts={counts} theme={theme} />
              <YStack flex={1} gap="$8">
                {(
                  [
                    ['success', 'Alles gut'],
                    ['warning', 'Achtung'],
                    ['critical', 'Kritisch'],
                    ['neutral', 'Ohne Sensor'],
                  ] as [DemoTone, string][]
                ).map(([tone, label]) => (
                  <XStack key={tone} alignItems="center" gap="$8">
                    <YStack width={10} height={10} borderRadius="$999" backgroundColor={toneHex(theme, tone)} />
                    <Text flex={1} fontFamily="$body" fontSize={13} color="$textSecondary">
                      {label}
                    </Text>
                    <Text fontFamily="$body" fontWeight="700" fontSize={14} color="$textPrimary">
                      {counts[tone]}
                    </Text>
                  </XStack>
                ))}
              </YStack>
            </XStack>
          </FadeIn>

          {DEMO_PLANTS.map((plant, index) => {
            const tone = demoTone(plant)
            const color = toneHex(theme, tone)
            const moisture = plant.summary?.moisture_median
            const history = DEMO_MOISTURE_HISTORY[plant.id]
            return (
              <FadeIn key={plant.id} delay={120 + index * 70} ignoreReducedMotion>
                <YStack padding="$16" gap="$12" borderRadius="$16" backgroundColor="$surface" borderWidth={1} borderColor={tone === 'critical' ? '$critical' : '$border'}>
                  <XStack alignItems="center" gap="$12">
                    <PlantAvatar mood={tone === 'critical' ? 'sad' : plant.character ?? 'neutral'} status={tone === 'neutral' ? 'neutral' : tone} size={40} />
                    <YStack flex={1}>
                      <Text fontFamily="$heading" fontSize={18} textTransform="uppercase" color="$textPrimary" numberOfLines={1}>
                        {plant.name.replace(/^.*'(.*)'$/, '$1')}
                      </Text>
                      <Text fontFamily="$body" fontSize={12} color="$textSecondary">
                        {plant.speciesName}
                      </Text>
                    </YStack>
                    {moisture !== undefined ? (
                      <XStack alignItems="baseline">
                        <Text fontFamily="$heading" fontSize={34} color={color} textShadowColor={color} textShadowRadius={10} textShadowOffset={{ width: 0, height: 0 }}>
                          {moisture}
                        </Text>
                        <Text fontFamily="$body" fontSize={13} color="$textSecondary">
                          %
                        </Text>
                      </XStack>
                    ) : (
                      <Text fontFamily="$body" fontSize={12} color="$accentText">
                        Sensor koppeln
                      </Text>
                    )}
                  </XStack>
                  {moisture !== undefined && history ? (
                    <XStack alignItems="flex-end" gap="$12">
                      <YStack flex={1} gap="$6">
                        <YStack height={6} borderRadius="$999" backgroundColor="$surfaceHigh" overflow="hidden">
                          {/* Zielbereich 40–70 % als helleres Band */}
                          <YStack position="absolute" left="40%" width="30%" top={0} bottom={0} backgroundColor="$successSoft" />
                          <YStack width={`${moisture}%`} height="100%" borderRadius="$999" backgroundColor={color} />
                        </YStack>
                        <XStack justifyContent="space-between">
                          <Text fontFamily="$body" fontSize={10} color="$textSecondary">
                            trocken
                          </Text>
                          <Text fontFamily="$body" fontSize={10} color="$textSecondary">
                            Ziel 40–70 %
                          </Text>
                          <Text fontFamily="$body" fontSize={10} color="$textSecondary">
                            nass
                          </Text>
                        </XStack>
                      </YStack>
                      <Sparkline values={history} color={color} id={`spark-${plant.id}`} />
                    </XStack>
                  ) : null}
                </YStack>
              </FadeIn>
            )
          })}
        </ScrollView>
      </SafeAreaView>
    </YStack>
  )
}
