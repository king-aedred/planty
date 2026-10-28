import { ArrivingLogo, type LogoOrigin, type LogoPosition } from '@/components/brand/arriving-logo'
import { AUTH_LOGO_SIZE, WELCOME_LOGO_SIZE } from '@/components/brand/auth-logo'
import { FadeIn } from '@/components/ui/fade-in'
import { Screen } from '@/components/ui/screen'
import { type Href, useLocalSearchParams, useRouter } from 'expo-router'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
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
  // Fortschritt 0–1 als dünne Leiste unter dem Logo (Onboarding). Ohne Wert keine Leiste.
  progress?: number
  // Ändert sich die Höhe der Box, gleiten Logo und Fortschrittsleiste gemeinsam und zügig an ihren neuen
  // Platz, statt zu springen. Die Box selbst wechselt ohne Gleiten (Onboarding mit unterschiedlich hohen Schritten).
  smoothLayout?: boolean
}

const HEADER_GLIDE_MS = 320
const LAYOUT_GAP = 24
const LAYOUT_PAD = 20

const OUT_MS = 220
const FINISH_MS = 420

// Gemeinsamer Rahmen für Login, Registrieren und Code-Eingabe: Logo über einer zentrierten Box.
// Parameter from/logoY/logoH/logoSize kommen vom vorherigen Screen (Willkommen oder anderer Auth-Screen).
export function AuthShell({ children, preview = false, progress, smoothLayout = false }: AuthShellProps) {
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

  const progressValue = useSharedValue(progress ?? 0)
  useEffect(() => {
    if (progress !== undefined) {
      progressValue.value = withTiming(progress, { duration: 500, easing: Easing.inOut(Easing.cubic), reduceMotion })
    }
  }, [progress, progressValue, reduceMotion])

  // Weiches Layout (Onboarding): Kopf und Box liegen absolut. Ihre Positionen werden aus den gemessenen Höhen
  // berechnet (Kopf + Abstand + Box mittig). Ändert sich die Boxhöhe, gleitet nur der Kopf an den neuen Platz;
  // so springt er nie erst und gleitet dann (onLayout kommt im Browser erst nach dem Zeichnen).
  const [areaHeight, setAreaHeight] = useState(0)
  const [contentHeight, setContentHeight] = useState(0)
  const headerHeight = useRef(0)
  const boxHeight = useRef(0)
  const headerY = useRef<number | null>(null)
  const headerTop = useSharedValue(0)
  const boxTop = useSharedValue(0)
  const layoutReady = useSharedValue(0)

  const relayout = (area: number) => {
    if (!smoothLayout || area === 0 || headerHeight.current === 0 || boxHeight.current === 0) {
      return
    }
    const total = headerHeight.current + LAYOUT_GAP + boxHeight.current
    const top = Math.max(LAYOUT_PAD, (area - total) / 2)
    boxTop.value = top + headerHeight.current + LAYOUT_GAP
    if (headerY.current === null) {
      headerTop.value = top
      layoutReady.value = 1
    } else if (Math.abs(headerY.current - top) > 0.5) {
      headerTop.value = withTiming(top, { duration: HEADER_GLIDE_MS, easing: Easing.out(Easing.cubic), reduceMotion })
    }
    headerY.current = top
    setContentHeight(total + 2 * LAYOUT_PAD)
  }

  const headerStyle = useAnimatedStyle(() => ({ opacity: layoutReady.value, transform: [{ translateY: headerTop.value }] }))
  const boxPositionStyle = useAnimatedStyle(() => ({ opacity: layoutReady.value, transform: [{ translateY: boxTop.value }] }))
  const progressStyle = useAnimatedStyle(() => ({ width: `${progressValue.value * 100}%` }))

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
              {smoothLayout ? (
                <YStack
                  flex={1}
                  minHeight={contentHeight}
                  onLayout={(event) => {
                    const area = event.nativeEvent.layout.height
                    setAreaHeight(area)
                    relayout(area)
                  }}
                >
                  <Animated.View
                    style={[{ position: 'absolute', top: 0, left: LAYOUT_PAD, right: LAYOUT_PAD }, headerStyle]}
                    onLayout={(event) => {
                      headerHeight.current = event.nativeEvent.layout.height
                      relayout(areaHeight)
                    }}
                  >
                    <YStack gap="$24">
                        <ArrivingLogo
                          origin={origin}
                          onPosition={(position) => {
                            logoPosition.current = position
                          }}
                          followLayout={!smoothLayout}
                          ignoreReducedMotion={preview}
                        />
                        {progress !== undefined ? (
                          <YStack height={4} borderRadius="$999" backgroundColor="$surfaceHigh" overflow="hidden" marginHorizontal="$24">
                            <Animated.View style={[{ height: '100%' }, progressStyle]}>
                              <YStack flex={1} borderRadius="$999" backgroundColor="$accent" />
                            </Animated.View>
                          </YStack>
                        ) : null}
                      </YStack>
                  </Animated.View>
                  <Animated.View
                    style={[{ position: 'absolute', top: 0, left: LAYOUT_PAD, right: LAYOUT_PAD, zIndex: 1 }, boxPositionStyle]}
                    onLayout={(event) => {
                      boxHeight.current = event.nativeEvent.layout.height
                      relayout(areaHeight)
                    }}
                  >
                    <Animated.View style={outStyle}>
                    <FadeIn delay={boxDelay} duration={origin ? 500 : 450} offset={origin ? 20 : 16} ignoreReducedMotion={preview}>
                      {children({ leaveTo, swap, finish })}
                    </FadeIn>
                  </Animated.View>
                  </Animated.View>
                </YStack>
              ) : (
                <YStack flex={1} justifyContent="center" padding="$20" gap="$24">
                  <>
                    <ArrivingLogo
                      origin={origin}
                      onPosition={(position) => {
                        logoPosition.current = position
                      }}
                      followLayout={!smoothLayout}
                      ignoreReducedMotion={preview}
                    />
                    {progress !== undefined ? (
                      <YStack height={4} borderRadius="$999" backgroundColor="$surfaceHigh" overflow="hidden" marginHorizontal="$24">
                        <Animated.View style={[{ height: '100%' }, progressStyle]}>
                          <YStack flex={1} borderRadius="$999" backgroundColor="$accent" />
                        </Animated.View>
                      </YStack>
                    ) : null}
                  </>
                  <Animated.View style={outStyle}>
                    <FadeIn delay={boxDelay} duration={origin ? 500 : 450} offset={origin ? 20 : 16} ignoreReducedMotion={preview}>
                      {children({ leaveTo, swap, finish })}
                    </FadeIn>
                  </Animated.View>
                </YStack>
              )}
            </Animated.View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Screen>
  )
}
