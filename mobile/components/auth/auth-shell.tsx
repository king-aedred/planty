import { ArrivingLogo, type LogoOrigin, type LogoPosition } from '@/components/brand/arriving-logo'
import { AUTH_LOGO_SIZE, WELCOME_LOGO_SIZE } from '@/components/brand/auth-logo'
import { FadeIn } from '@/components/ui/fade-in'
import { Screen } from '@/components/ui/screen'
import { type Href, useLocalSearchParams, useRouter } from 'expo-router'
import { type ReactNode, useCallback, useRef } from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback } from 'react-native'
import Animated, { Easing, ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { YStack } from 'tamagui'

export type AuthShellHelpers = {
  // Box ausblenden, dann zum nächsten Auth-Screen; dessen Logo gleitet von hier weiter.
  leaveTo: (path: string) => void
  // Box ausblenden, Inhalt wechseln (z. B. Formular → Code), Box wieder einblenden.
  swap: (change: () => void) => void
  // Fertig angemeldet: Logo und Box zoomen leicht auf und blenden aus, dann in die App.
  finish: (path: string) => void
}

type AuthShellProps = {
  children: (helpers: AuthShellHelpers) => ReactNode
  preview?: boolean
}

const OUT_MS = 220
const FINISH_MS = 420

// Gemeinsamer Rahmen für Login, Registrieren und Code-Eingabe: Logo über einer zentrierten Box.
// Parameter from/logoY/logoH/logoSize kommen vom vorherigen Screen (Willkommen oder anderer Auth-Screen).
export function AuthShell({ children, preview = false }: AuthShellProps) {
  const router = useRouter()
  const params = useLocalSearchParams<{ from?: string; logoY?: string; logoH?: string; logoSize?: string }>()
  const fromWelcome = params.from === 'welcome'
  const hasOrigin = (fromWelcome || params.from === 'auth') && Number.isFinite(Number(params.logoY)) && Number(params.logoH) > 0
  const origin: LogoOrigin | null = hasOrigin
    ? {
        y: Number(params.logoY),
        height: Number(params.logoH),
        size: Number(params.logoSize) || (fromWelcome ? WELCOME_LOGO_SIZE : AUTH_LOGO_SIZE),
      }
    : null

  const reduceMotion = preview ? ReduceMotion.Never : ReduceMotion.System
  const out = useSharedValue(0)
  const logoPosition = useRef<LogoPosition | null>(null)
  const isLeaving = useRef(false)

  const navigate = useCallback(
    (path: string) => {
      const position = logoPosition.current
      const query = position
        ? `from=auth&logoY=${Math.round(position.y)}&logoH=${Math.round(position.height)}&logoSize=${AUTH_LOGO_SIZE}`
        : ''
      router.replace(`${path}${query ? (path.includes('?') ? '&' : '?') + query : ''}` as Href)
    },
    [router],
  )

  const leaveTo = (path: string) => {
    if (isLeaving.current) {
      return
    }
    isLeaving.current = true
    out.value = withTiming(1, { duration: OUT_MS, easing: Easing.out(Easing.quad), reduceMotion }, (finished) => {
      if (finished) {
        runOnJS(navigate)(path)
      }
    })
  }

  const swap = (change: () => void) => {
    out.value = withTiming(1, { duration: OUT_MS, easing: Easing.out(Easing.quad), reduceMotion }, (finished) => {
      if (finished) {
        runOnJS(change)()
        out.value = withDelay(80, withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic), reduceMotion }), reduceMotion)
      }
    })
  }

  const exit = useSharedValue(0)

  const goHome = useCallback((path: string) => router.replace(path as Href), [router])

  const finish = (path: string) => {
    if (isLeaving.current) {
      return
    }
    isLeaving.current = true
    exit.value = withTiming(1, { duration: FINISH_MS, easing: Easing.in(Easing.cubic), reduceMotion }, (finished) => {
      if (finished) {
        runOnJS(goHome)(path)
      }
    })
  }

  const exitStyle = useAnimatedStyle(() => ({
    flex: 1,
    opacity: 1 - exit.value,
    transform: [{ scale: 1 + exit.value * 0.06 }],
  }))

  const outStyle = useAnimatedStyle(() => ({
    opacity: 1 - out.value,
    transform: [{ translateY: out.value * 12 }],
  }))

  // Box erst, wenn das Logo angekommen ist bzw. kurz nach dessen Einblenden.
  const boxDelay = origin ? (fromWelcome ? 320 : 260) : 120

  return (
    <Screen edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            <Animated.View style={exitStyle}>
              <YStack flex={1} justifyContent="center" padding="$20" gap="$24">
                <ArrivingLogo
                  origin={origin}
                  onPosition={(position) => {
                    logoPosition.current = position
                  }}
                  ignoreReducedMotion={preview}
                />
                <Animated.View style={outStyle}>
                  <FadeIn delay={boxDelay} duration={origin ? 500 : 450} offset={origin ? 20 : 16} ignoreReducedMotion={preview}>
                    {children({ leaveTo, swap, finish })}
                  </FadeIn>
                </Animated.View>
              </YStack>
            </Animated.View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Screen>
  )
}
