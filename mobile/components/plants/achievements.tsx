import { Ionicons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import { Text, useTheme, XStack, YStack } from 'tamagui'

type IconName = ComponentProps<typeof Ionicons>['name']

export type Badge = { id: string; icon: IconName; label: string; earned: boolean }

export type AchievementStat = { icon: IconName; color: string; value: string; label: string }

type AchievementsProps = {
  // Zwei große Kennzahlen, z. B. Tage im grünen Bereich.
  stats: AchievementStat[]
  badges: Badge[]
}

function StatTile({ icon, color, value, label }: { icon: IconName; color: string; value: string; label: string }) {
  const theme = useTheme()
  const resolved = (theme as unknown as Record<string, { val: string } | undefined>)[color.replace('$', '')]?.val
  return (
    <YStack flex={1} padding="$12" gap="$6" borderRadius="$12" backgroundColor="$background" borderWidth={1} borderColor="$border">
      <XStack alignItems="center" gap="$6">
        <Ionicons name={icon} size={18} color={resolved} />
        <Text fontFamily="$heading" fontSize={26} color={color}>
          {value}
        </Text>
      </XStack>
      <Text fontFamily="$body" fontSize={12} lineHeight="$3" color="$textSecondary">
        {label}
      </Text>
    </YStack>
  )
}

// Kleine Erfolge einer Pflanze (Gamification): Kennzahlen und Abzeichen; noch nicht erreichte Abzeichen
// sind ausgegraut.
export function Achievements({ stats, badges }: AchievementsProps) {
  const theme = useTheme()
  const earned = badges.filter((badge) => badge.earned).length

  return (
    <YStack padding="$16" gap="$12" borderRadius="$16" backgroundColor="$surface" borderWidth={1} borderColor="$border">
      <XStack justifyContent="space-between" alignItems="baseline">
        <Text fontFamily="$body" fontWeight="700" fontSize={12} letterSpacing={1} textTransform="uppercase" color="$textSecondary">
          Erfolge
        </Text>
        <Text fontFamily="$body" fontSize={12} color="$textSecondary">
          {earned} von {badges.length} Abzeichen
        </Text>
      </XStack>

      <XStack gap="$8">
        {stats.map((stat) => (
          <StatTile key={stat.label} {...stat} />
        ))}
      </XStack>

      <XStack gap="$8" flexWrap="wrap">
        {badges.map((badge) => (
          <XStack
            key={badge.id}
            alignItems="center"
            gap="$6"
            paddingVertical="$6"
            paddingHorizontal="$12"
            borderRadius="$999"
            backgroundColor={badge.earned ? '$characterHappySoft' : '$surfaceElevated'}
            opacity={badge.earned ? 1 : 0.5}
          >
            <Ionicons name={badge.earned ? badge.icon : 'lock-closed'} size={14} color={badge.earned ? theme.characterHappy?.val : theme.textSecondary?.val} />
            <Text fontFamily="$body" fontWeight="600" fontSize={12} color={badge.earned ? '$textPrimary' : '$textSecondary'}>
              {badge.label}
            </Text>
          </XStack>
        ))}
      </XStack>
    </YStack>
  )
}
