import Svg, { Rect } from 'react-native-svg'
import { Text, useTheme, XStack } from 'tamagui'

type LogoProps = {
  size?: number
  variant?: 'full' | 'mark'
}

// Placeholder brand mark: two nested squares (no leaf, no plant-pot cliché).
// A real logo will replace this file's contents later without touching callers.
export function Logo({ size = 32, variant = 'full' }: LogoProps) {
  const theme = useTheme()

  const mark = (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Rect x={2} y={2} width={28} height={28} rx={6} fill={theme.brand.val} />
      <Rect
        x={10}
        y={10}
        width={12}
        height={12}
        rx={2}
        fill={theme.accent.val}
        transform="rotate(45 16 16)"
      />
    </Svg>
  )

  if (variant === 'mark') {
    return mark
  }

  return (
    <XStack alignItems="center" gap={size * 0.3}>
      {mark}
      <Text
        fontFamily="$heading"
        color="$textPrimary"
        fontSize={size * 0.7}
        letterSpacing={size * 0.06}
        textTransform="uppercase"
      >
        Planty
      </Text>
    </XStack>
  )
}
