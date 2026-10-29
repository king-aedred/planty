import { DEMO_PLANTS, demoTone, TONE_COLOR } from '@/components/plants/dashboard-demo'
import { PlantAvatar } from '@/components/plants/plant-avatar'
import { FadeIn } from '@/components/ui/fade-in'
import { Ionicons } from '@expo/vector-icons'
import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, useTheme, XStack, YStack } from 'tamagui'

// Variante 2 „Stimmen“: Das Dashboard als Gespräch. Jede Pflanze spricht in ihrer Sprechblase (Farbe nach
// Persönlichkeit), Messwerte nur als kleine Chips darunter. Oben eine Leiste mit allen Avataren wie Stories.

const CHARACTER_SOFT = { happy: '$characterHappySoft', grumpy: '$characterGrumpySoft', neutral: '$characterNeutralSoft' } as const
const CHARACTER_COLOR = { happy: '$characterHappy', grumpy: '$characterGrumpy', neutral: '$characterNeutral' } as const
const TIMES = ['vor 5 Min.', 'vor 20 Min.', 'vor 1 Std.', 'vor 2 Std.', 'gestern']

function Chip({ icon, label, color }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; color?: string }) {
  const theme = useTheme()
  return (
    <XStack alignItems="center" gap="$4" paddingHorizontal="$8" paddingVertical="$4" borderRadius="$999" backgroundColor="$surfaceElevated">
      <Ionicons name={icon} size={12} color={theme.textSecondary?.val} />
      <Text fontFamily="$body" fontSize={11} fontWeight="600" color={color ?? '$textSecondary'}>
        {label}
      </Text>
    </XStack>
  )
}

export default function VoicesVariant() {
  const theme = useTheme()
  return (
    <YStack flex={1} backgroundColor="$background">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }}>
          <FadeIn ignoreReducedMotion>
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontFamily="$heading" fontSize={30} color="$textPrimary">
                Deine Pflanzen
              </Text>
              <Ionicons name="add-circle" size={32} color={theme.accentText?.val} />
            </XStack>
          </FadeIn>

          <FadeIn delay={80} ignoreReducedMotion>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
              {DEMO_PLANTS.map((plant) => {
                const tone = demoTone(plant)
                return (
                  <YStack key={plant.id} alignItems="center" gap="$6" width={64}>
                    <YStack padding={3} borderRadius="$999" borderWidth={2} borderColor={TONE_COLOR[tone]}>
                      <PlantAvatar mood={tone === 'critical' ? 'sad' : plant.character ?? 'neutral'} status={tone === 'neutral' ? 'neutral' : tone} size={52} />
                    </YStack>
                    <Text fontFamily="$body" fontSize={11} color="$textSecondary" numberOfLines={1}>
                      {plant.name.replace(/^.*'(.*)'$/, '$1')}
                    </Text>
                  </YStack>
                )
              })}
            </ScrollView>
          </FadeIn>

          {DEMO_PLANTS.map((plant, index) => {
            const tone = demoTone(plant)
            const character = plant.character ?? 'neutral'
            const short = plant.name.replace(/^.*'(.*)'$/, '$1')
            return (
              <FadeIn key={plant.id} delay={160 + index * 70} ignoreReducedMotion>
                <XStack gap="$12" alignItems="flex-end">
                  <PlantAvatar mood={tone === 'critical' ? 'sad' : character} status={tone === 'neutral' ? 'neutral' : tone} size={40} />
                  <YStack flex={1} gap="$6">
                    <XStack alignItems="baseline" gap="$8">
                      <Text fontFamily="$body" fontWeight="700" fontSize={13} color={CHARACTER_COLOR[character]}>
                        {short}
                      </Text>
                      <Text fontFamily="$body" fontSize={11} color="$textSecondary">
                        {TIMES[index] ?? ''}
                      </Text>
                    </XStack>
                    <YStack
                      paddingVertical="$12"
                      paddingHorizontal="$16"
                      borderRadius="$16"
                      borderBottomLeftRadius="$4"
                      backgroundColor={tone === 'critical' ? '$criticalSoft' : CHARACTER_SOFT[character]}
                      borderWidth={1}
                      borderColor={tone === 'critical' ? '$critical' : 'transparent'}
                    >
                      <Text fontFamily="$body" fontSize={16} lineHeight="$5" color="$textPrimary">
                        {plant.hasSensor === false ? 'Ich hab noch keinen Sensor. Sag mir, wie es mir geht? 🥺' : plant.quote}
                      </Text>
                    </YStack>
                    {plant.summary ? (
                      <XStack gap="$6" flexWrap="wrap">
                        <Chip icon="water" label={`${plant.summary.moisture_median} %`} color={TONE_COLOR[tone]} />
                        {plant.summary.temperature_median !== undefined ? <Chip icon="thermometer" label={`${plant.summary.temperature_median}°`} /> : null}
                        {plant.summary.light_level_median !== undefined ? <Chip icon="sunny" label={`${plant.summary.light_level_median} lx`} /> : null}
                      </XStack>
                    ) : (
                      <XStack>
                        <Chip icon="radio-outline" label="Sensor koppeln" color="$accentText" />
                      </XStack>
                    )}
                  </YStack>
                </XStack>
              </FadeIn>
            )
          })}
        </ScrollView>
      </SafeAreaView>
    </YStack>
  )
}
