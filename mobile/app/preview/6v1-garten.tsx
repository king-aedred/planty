import { DEMO_PLANTS, demoTone, TONE_COLOR } from '@/components/plants/dashboard-demo'
import { PlantAvatar } from '@/components/plants/plant-avatar'
import type { DashboardPlant } from '@/components/plants/plant-dashboard'
import { FadeIn } from '@/components/ui/fade-in'
import { Ionicons } from '@expo/vector-icons'
import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle } from 'react-native-svg'
import { Text, useTheme, XStack, YStack } from 'tamagui'

// Variante 1 „Garten“: Begrüßung mit Tageszusammenfassung, die dringendste Pflanze als großes Hero-Element,
// alle Pflanzen als 2er-Raster mit Feuchte-Ring um den Avatar.

function MoistureRing({ value, size, color, children }: { value: number | null; size: number; color: string; children: React.ReactNode }) {
  const theme = useTheme()
  const stroke = 5
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const fraction = value === null ? 0 : Math.max(0, Math.min(1, value / 100))
  const resolved = (theme as unknown as Record<string, { val: string } | undefined>)[color.replace('$', '')]?.val
  return (
    <YStack width={size} height={size} alignItems="center" justifyContent="center">
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.surfaceHigh?.val} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={resolved}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference * fraction} ${circumference}`}
        />
      </Svg>
      {children}
    </YStack>
  )
}

function Tile({ plant }: { plant: DashboardPlant }) {
  const tone = demoTone(plant)
  const moisture = plant.summary?.moisture_median ?? null
  return (
    <YStack flex={1} minWidth="45%" padding="$16" gap="$12" borderRadius="$16" backgroundColor="$surface" borderWidth={1} borderColor="$border" alignItems="center">
      <MoistureRing value={moisture} size={96} color={TONE_COLOR[tone]}>
        <PlantAvatar mood={tone === 'critical' ? 'sad' : plant.character ?? 'neutral'} status={tone === 'neutral' ? 'neutral' : tone} size={64} />
      </MoistureRing>
      <YStack alignItems="center" gap="$2">
        <Text fontFamily="$heading" fontSize={18} letterSpacing={0.4} textTransform="uppercase" color="$textPrimary" numberOfLines={1}>
          {plant.name.replace(/^.*'(.*)'$/, '$1')}
        </Text>
        <Text fontFamily="$body" fontSize={12} color={TONE_COLOR[tone]}>
          {plant.hasSensor === false ? 'Kein Sensor' : `${moisture ?? '–'} % Feuchte`}
        </Text>
      </YStack>
    </YStack>
  )
}

export default function GardenVariant() {
  const theme = useTheme()
  const urgent = DEMO_PLANTS.find((plant) => demoTone(plant) === 'critical')
  const happy = DEMO_PLANTS.filter((plant) => demoTone(plant) === 'success').length

  return (
    <YStack flex={1} backgroundColor="$background">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
          <FadeIn ignoreReducedMotion>
            <XStack justifyContent="space-between" alignItems="center">
              <YStack gap="$2">
                <Text fontFamily="$body" fontSize={13} color="$textSecondary">
                  Donnerstag, 29. Oktober
                </Text>
                <Text fontFamily="$heading" fontSize={30} color="$textPrimary">
                  Guten Morgen, Hannes
                </Text>
              </YStack>
              <YStack width={40} height={40} borderRadius="$999" backgroundColor="$surfaceElevated" alignItems="center" justifyContent="center">
                <Ionicons name="notifications-outline" size={20} color={theme.textSecondary?.val} />
              </YStack>
            </XStack>
            <Text fontFamily="$body" fontSize={15} lineHeight="$5" color="$textSecondary" marginTop="$8">
              {happy} Pflanzen sind glücklich. <Text color="$criticalText" fontWeight="700">Ben hat Durst.</Text>
            </Text>
          </FadeIn>

          {urgent ? (
            <FadeIn delay={100} ignoreReducedMotion>
              <XStack padding="$16" gap="$16" alignItems="center" borderRadius="$16" backgroundColor="$criticalSoft" borderWidth={1} borderColor="$critical">
                <PlantAvatar mood="sad" status="critical" size={64} />
                <YStack flex={1} gap="$4">
                  <Text fontFamily="$body" fontWeight="700" fontSize={11} letterSpacing={1} textTransform="uppercase" color="$criticalText">
                    Jetzt wichtig
                  </Text>
                  <Text fontFamily="$heading" fontSize={22} color="$textPrimary">
                    „{urgent.quote}“
                  </Text>
                  <Text fontFamily="$body" fontSize={13} color="$textSecondary">
                    {urgent.name} · {urgent.summary?.moisture_median} % Feuchte
                  </Text>
                </YStack>
              </XStack>
            </FadeIn>
          ) : null}

          <FadeIn delay={180} ignoreReducedMotion>
            <XStack flexWrap="wrap" gap="$12">
              {DEMO_PLANTS.map((plant) => (
                <Tile key={plant.id} plant={plant} />
              ))}
              <YStack flex={1} minWidth="45%" minHeight={170} borderRadius="$16" borderWidth={1} borderStyle="dashed" borderColor="$borderStrong" alignItems="center" justifyContent="center" gap="$8">
                <Ionicons name="add" size={28} color={theme.accentText?.val} />
                <Text fontFamily="$body" fontWeight="600" fontSize={13} color="$accentText">
                  Pflanze hinzufügen
                </Text>
              </YStack>
            </XStack>
          </FadeIn>
        </ScrollView>
      </SafeAreaView>
    </YStack>
  )
}
