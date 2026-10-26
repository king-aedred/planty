import { useRef } from 'react'
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { XStack } from 'tamagui'
import { AUTH_LOGO_SIZE } from './auth-logo'
import { Logo } from './logo'

// Startpunkt des Logos auf dem vorherigen Screen: Oberkante, Höhe und Logo-Größe, gemessen ab dem Inhaltsbereich.
export type LogoOrigin = { y: number; height: number; size: number }
export type LogoPosition = { y: number; height: number }

type ArrivingLogoProps = {
  // Mit origin gleitet das Logo von dort an seinen Platz, ohne blendet es kurz ein.
  origin: LogoOrigin | null
  // Meldet die aktuelle Position, damit der Screen sie beim Verlassen weitergeben kann.
  onPosition?: (position: LogoPosition) => void
  ignoreReducedMotion?: boolean
}

const GLIDE_MS = 520

// Auth-Logo: gleitet vom vorherigen Screen an seinen Platz und weich mit, wenn sich sein Platz ändert
// (z. B. weil die Box darunter höher wird). Bis zur ersten Messung unsichtbar, damit nichts aufblitzt.
export function ArrivingLogo({ origin, onPosition, ignoreReducedMotion = false }: ArrivingLogoProps) {
  const progress = useSharedValue(1)
  const visible = useSharedValue(0)
  const offsetY = useSharedValue(0)
  const startScale = useSharedValue(1)
  const lastY = useRef<number | null>(null)
  const reduceMotion = ignoreReducedMotion ? ReduceMotion.Never : ReduceMotion.System

  const glide = (fromOffset: number, fromScale: number) => {
    offsetY.value = fromOffset
    startScale.value = fromScale
    progress.value = 0
    progress.value = withTiming(1, { duration: GLIDE_MS, easing: Easing.inOut(Easing.cubic), reduceMotion })
  }

  const handleLayout = (event: { nativeEvent: { layout: { y: number; height: number } } }) => {
    const { y, height } = event.nativeEvent.layout
    onPosition?.({ y, height })

    if (lastY.current === null) {
      lastY.current = y
      if (origin) {
        // Mitte auf Mitte, weil die Skalierung um die Mitte wirkt.
        glide(origin.y + origin.height / 2 - (y + height / 2), origin.size / AUTH_LOGO_SIZE)
        visible.value = 1
      } else {
        visible.value = withTiming(1, { duration: 350, reduceMotion })
      }
      return
    }

    if (Math.abs(y - lastY.current) > 0.5) {
      glide(lastY.current - y, 1)
      lastY.current = y
    }
  }

  const style = useAnimatedStyle(() => ({
    opacity: visible.value,
    transform: [
      { translateY: (1 - progress.value) * offsetY.value },
      { scale: startScale.value + (1 - startScale.value) * progress.value },
    ],
  }))

  return (
    <Animated.View style={style} onLayout={handleLayout}>
      <XStack justifyContent="center">
        <Logo variant="full" size={AUTH_LOGO_SIZE} />
      </XStack>
    </Animated.View>
  )
}
