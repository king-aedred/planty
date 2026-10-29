import { type ReactNode, useEffect } from 'react'
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'

type FadeInProps = {
  children: ReactNode
  // Wartezeit vor dem Einblenden in ms (für gestaffelte Abschnitte).
  delay?: number
  duration?: number
  // Startversatz nach unten in px; der Inhalt gleitet von dort an seinen Platz.
  offset?: number
  // Systemeinstellung „Bewegung reduzieren“ übergehen (nur für Vorschau-Seiten).
  ignoreReducedMotion?: boolean
  // Den verfügbaren Platz ausfüllen (ganze Seiten statt Abschnitte).
  fill?: boolean
}

// Einblenden beim Erscheinen: Deckkraft 0 → 1, leicht von unten. Bei „Bewegung reduzieren“ sofort sichtbar.
export function FadeIn({ children, delay = 0, duration = 450, offset = 16, ignoreReducedMotion = false, fill = false }: FadeInProps) {
  const systemReducedMotion = useReducedMotion()
  const reducedMotion = systemReducedMotion && !ignoreReducedMotion
  const progress = useSharedValue(reducedMotion ? 1 : 0)

  useEffect(() => {
    if (reducedMotion) {
      return
    }
    // Reanimated springt bei „Bewegung reduzieren“ sonst selbst ans Ende; Never erzwingt die Animation.
    const reduceMotion = ignoreReducedMotion ? ReduceMotion.Never : ReduceMotion.System
    progress.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic), reduceMotion }), reduceMotion)
  }, [delay, duration, ignoreReducedMotion, progress, reducedMotion])

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * offset }],
  }))

  return <Animated.View style={[fill ? { flex: 1 } : null, style]}>{children}</Animated.View>
}
