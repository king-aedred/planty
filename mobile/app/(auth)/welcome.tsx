import { WELCOME_LOGO_SIZE } from '@/components/brand/auth-logo'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { FadeIn } from '@/components/ui/fade-in'
import { Screen } from '@/components/ui/screen'
import { SectionLabel } from '@/components/ui/section-label'
import { type Href, useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef } from 'react'
import Animated, {
  Easing,
  interpolate,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { YStack } from 'tamagui'

// Ablauf der Startanimation (ms): Logo erscheint in der Mitte, wandert nach oben, dann folgt der Inhalt.
const LOGO_IN_MS = 700
const LIFT_AT_MS = 1100
const LIFT_MS = 600
const CONTENT_AT_MS = LIFT_AT_MS + 250
const LOGO_START_SCALE = 1.35
const STACK_GAP = 32
// Übergang zum Login: Knöpfe blenden aus, dann übernimmt der Login das Logo an derselben Stelle
// (Position als Parameter) und lässt es an seinen Platz gleiten.
const BUTTONS_OUT_MS = 260

export default function Page() {
  return <WelcomeContent />
}

// Erster Screen ohne Login: kurze Logo-Animation, dann die Frage „Konto oder neu?“.
// preview: für /preview, Knöpfe führen zu den Vorschau-Seiten statt zu den echten Auth-Routen,
// und die Animation läuft auch bei „Bewegung reduzieren“ (zum Begutachten).
export function WelcomeContent({ preview = false }: { preview?: boolean }) {
  const router = useRouter()
  const systemReducedMotion = useReducedMotion()
  const reducedMotion = systemReducedMotion && !preview
  const reduceMotion = preview ? ReduceMotion.Never : ReduceMotion.System
  const appear = useSharedValue(reducedMotion ? 1 : 0)
  const lift = useSharedValue(reducedMotion ? 1 : 0)
  // Abstand von der Ruheposition des Logos bis zur Bildschirmmitte, gemessen am Inhalt darunter.
  const centerOffset = useSharedValue(0)
  // Ruheposition und Höhe des Logos im Screen; der Login startet sein Logo genau dort.
  const logoRest = useRef({ y: 0, height: WELCOME_LOGO_SIZE })
  const buttonsOut = useSharedValue(0)
  const isLeaving = useRef(false)

  useEffect(() => {
    if (reducedMotion) {
      return
    }
    appear.value = withTiming(1, { duration: LOGO_IN_MS, easing: Easing.out(Easing.back(1.4)), reduceMotion })
    lift.value = withDelay(LIFT_AT_MS, withTiming(1, { duration: LIFT_MS, easing: Easing.inOut(Easing.cubic), reduceMotion }), reduceMotion)
  }, [appear, lift, reduceMotion, reducedMotion])

  // Zurück vom Login: Knöpfe wieder einblenden.
  useFocusEffect(
    useCallback(() => {
      if (!isLeaving.current) {
        return
      }
      isLeaving.current = false
      buttonsOut.value = withDelay(150, withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic), reduceMotion }), reduceMotion)
    }, [buttonsOut, reduceMotion]),
  )

  const logoStyle = useAnimatedStyle(() => {
    const startScale = interpolate(appear.value, [0, 1], [0.6, LOGO_START_SCALE])
    return {
      opacity: interpolate(appear.value, [0, 0.5], [0, 1], 'clamp'),
      transform: [
        { translateY: (1 - lift.value) * centerOffset.value },
        { scale: interpolate(lift.value, [0, 1], [startScale, 1]) },
      ],
    }
  })

  const buttonsStyle = useAnimatedStyle(() => ({
    opacity: 1 - buttonsOut.value,
    transform: [{ translateY: buttonsOut.value * 12 }],
  }))

  const handleLogoLayout = (event: { nativeEvent: { layout: { y: number; height: number } } }) => {
    logoRest.current = { y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height }
  }

  const handleContentLayout = (event: { nativeEvent: { layout: { height: number } } }) => {
    centerOffset.value = (event.nativeEvent.layout.height + STACK_GAP) / 2
  }

  const goTo = useCallback(
    (target: 'sign-in' | 'sign-up') => {
      const { y, height } = logoRest.current
      const path = preview ? (target === 'sign-in' ? '/preview/1-login' : '/preview/2-register') : `/(auth)/${target}`
      router.push(`${path}?from=welcome&logoY=${Math.round(y)}&logoH=${Math.round(height)}&logoSize=${WELCOME_LOGO_SIZE}` as Href)
    },
    [preview, router],
  )

  const leaveTo = (target: 'sign-in' | 'sign-up') => {
    if (isLeaving.current) {
      return
    }
    isLeaving.current = true
    buttonsOut.value = withTiming(1, { duration: BUTTONS_OUT_MS, easing: Easing.out(Easing.quad), reduceMotion }, (finished) => {
      if (finished) {
        runOnJS(goTo)(target)
      }
    })
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <YStack flex={1} justifyContent="center" gap={STACK_GAP} paddingHorizontal="$8">
        <Animated.View style={[{ alignItems: 'center' }, logoStyle]} onLayout={handleLogoLayout}>
          <Logo variant="full" size={WELCOME_LOGO_SIZE} />
        </Animated.View>

        <YStack onLayout={handleContentLayout}>
          <FadeIn delay={reducedMotion ? 0 : CONTENT_AT_MS} ignoreReducedMotion={preview}>
            <Animated.View style={buttonsStyle}>
              <YStack gap="$12">
                <YStack alignItems="center">
                  <SectionLabel>Hast du schon ein Konto?</SectionLabel>
                </YStack>
                <Button onPress={() => leaveTo('sign-up')}>Nein, Konto erstellen</Button>
                <Button variant="secondary" onPress={() => leaveTo('sign-in')}>
                  Ja, anmelden
                </Button>
              </YStack>
            </Animated.View>
          </FadeIn>
        </YStack>
      </YStack>
    </Screen>
  )
}
