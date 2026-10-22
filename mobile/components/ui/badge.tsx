import { Text, XStack, YStack } from 'tamagui'

export type BadgeTone = 'success' | 'warning' | 'critical' | 'accent' | 'neutral'

const TONES: Record<BadgeTone, { background: string; color: string }> = {
  success: { background: '$successSoft', color: '$success' },
  warning: { background: '$warningSoft', color: '$warning' },
  critical: { background: '$criticalSoft', color: '$critical' },
  accent: { background: '$accentSoft', color: '$accentText' },
  neutral: { background: '$neutralSoft', color: '$textSecondary' },
}

type BadgeProps = {
  tone: BadgeTone
  label: string
  // Punkt vor dem Text (Standard: ja).
  dot?: boolean
}

// Pille: gedämpfte Fläche, Text und Punkt in voller Tonfarbe.
export function Badge({ tone, label, dot = true }: BadgeProps) {
  const colors = TONES[tone]

  return (
    <XStack
      alignSelf="flex-start"
      alignItems="center"
      gap="$6"
      backgroundColor={colors.background}
      borderRadius="$999"
      paddingVertical="$4"
      paddingHorizontal="$8"
    >
      {dot ? <YStack width={6} height={6} borderRadius="$999" backgroundColor={colors.color} /> : null}
      <Text fontFamily="$body" fontWeight="700" fontSize={11} letterSpacing={0.4} color={colors.color}>
        {label}
      </Text>
    </XStack>
  )
}
