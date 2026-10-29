import { Logo } from '@/components/brand/logo'
import { FadeIn } from '@/components/ui/fade-in'
import { TAB_BAR_SPACE } from '@/components/ui/tab-bar'
import type { ReactNode } from 'react'
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'

// App-Kopf der Tab-Seiten, Varianten zum Vergleich (Vorschau):
// brand: schlanke, feste Markenleiste (Logo + CALLGREEN links), darunter der große Seitentitel.
// glow: leuchtende Wortmarke mittig, darunter der Seitentitel; beim Scrollen erscheint eine schmale Leiste.
// greeting: Logo-Symbol links; auf dem Pflanzen-Tab eine Begrüßung nach Tageszeit statt des Titels.
export type HeaderVariant = 'brand' | 'glow' | 'greeting'

type TabPageProps = {
  variant: HeaderVariant
  title: string
  subtitle?: string
  action?: ReactNode
  // Pflanzen-Tab: in der Variante greeting die Begrüßung als Überschrift.
  greet?: boolean
  userName?: string
  children: ReactNode
}

const BAR_HEIGHT = 52

export function greetingFor(hour: number, name: string) {
  const prefix = hour < 5 ? 'Gute Nacht' : hour < 11 ? 'Guten Morgen' : hour < 17 ? 'Hallo' : hour < 22 ? 'Guten Abend' : 'Gute Nacht'
  return `${prefix}, ${name}`
}

function GlowWordmark({ size }: { size: number }) {
  return (
    <Text
      fontFamily="$heading"
      fontSize={size}
      letterSpacing={size * 0.08}
      textTransform="uppercase"
      color="$accentText"
      textShadowColor="rgba(88, 68, 193, 0.6)"
      textShadowRadius={size * 0.5}
      textShadowOffset={{ width: 0, height: 0 }}
    >
      Callgreen
    </Text>
  )
}

export function TabPage({ variant, title, subtitle, action, greet = false, userName = 'Hannes', children }: TabPageProps) {
  const insets = useSafeAreaInsets()
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y
  })

  // Große Wortmarke blendet beim Scrollen aus, die schmale Leiste ein.
  const bigStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 50], [1, 0], 'clamp'),
    transform: [{ scale: interpolate(scrollY.value, [0, 60], [1, 0.9], 'clamp') }],
  }))
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [40, 90], [0, 1], 'clamp'),
    transform: [{ translateY: interpolate(scrollY.value, [40, 90], [-8, 0], 'clamp') }],
  }))

  const heading = variant === 'greeting' && greet ? greetingFor(new Date().getHours(), userName) : title

  if (variant === 'brand') {
    return (
      <YStack flex={1} backgroundColor="$background">
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingTop: insets.top + BAR_HEIGHT + 28, paddingHorizontal: 16, paddingBottom: 16 + TAB_BAR_SPACE, gap: 18 }}
          keyboardShouldPersistTaps="handled"
        >
          <FadeIn duration={350} offset={8} ignoreReducedMotion>
            <XStack justifyContent="space-between" alignItems="center">
              <YStack flex={1}>
                <Text fontFamily="$heading" fontSize={30} color="$textPrimary">
                  {title}
                </Text>
                {subtitle ? (
                  <Text fontFamily="$body" fontSize={13} color="$textSecondary">
                    {subtitle}
                  </Text>
                ) : null}
              </YStack>
              {action}
            </XStack>
          </FadeIn>
          <FadeIn delay={80} duration={400} ignoreReducedMotion>
            <YStack gap="$16">{children}</YStack>
          </FadeIn>
        </Animated.ScrollView>

        {/* Feste Markenleiste: nur Logo und Name, ohne Trenner. */}
        <YStack position="absolute" top={0} left={0} right={0} paddingTop={insets.top} backgroundColor="$background">
          <XStack height={BAR_HEIGHT} alignItems="center" paddingHorizontal="$16">
            <Logo variant="full" size={20} />
          </XStack>
        </YStack>
      </YStack>
    )
  }

  return (
    <YStack flex={1} backgroundColor="$background">
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 16 + TAB_BAR_SPACE, gap: 18 }}
        keyboardShouldPersistTaps="handled"
      >
        <FadeIn duration={350} offset={8} ignoreReducedMotion>
          {variant === 'glow' ? (
            <YStack gap="$16">
              <Animated.View style={[{ alignItems: 'center', paddingVertical: 6 }, bigStyle]}>
                <GlowWordmark size={30} />
              </Animated.View>
              <XStack justifyContent="space-between" alignItems="center">
                <YStack flex={1}>
                  <Text fontFamily="$heading" fontSize={28} color="$textPrimary">
                    {title}
                  </Text>
                  {subtitle ? (
                    <Text fontFamily="$body" fontSize={13} color="$textSecondary">
                      {subtitle}
                    </Text>
                  ) : null}
                </YStack>
                {action}
              </XStack>
            </YStack>
          ) : (
            <YStack gap="$12">
              <XStack justifyContent="space-between" alignItems="center" minHeight={40}>
                <XStack alignItems="center" gap="$8">
                  <Logo variant="mark" size={26} />
                  {greet ? null : (
                    <Text fontFamily="$heading" fontSize={26} color="$textPrimary">
                      {title}
                    </Text>
                  )}
                </XStack>
                {action}
              </XStack>
              {greet ? (
                <YStack>
                  <Text fontFamily="$heading" fontSize={30} color="$textPrimary">
                    {heading}
                  </Text>
                  {subtitle ? (
                    <Text fontFamily="$body" fontSize={14} color="$textSecondary">
                      {subtitle}
                    </Text>
                  ) : null}
                </YStack>
              ) : subtitle ? (
                <Text fontFamily="$body" fontSize={13} color="$textSecondary" marginTop={-6}>
                  {subtitle}
                </Text>
              ) : null}
            </YStack>
          )}
        </FadeIn>
        <FadeIn delay={80} duration={400} ignoreReducedMotion>
          <YStack gap="$16">{children}</YStack>
        </FadeIn>
      </Animated.ScrollView>

      {/* Schmale Leiste beim Scrollen */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0 }, barStyle]}>
        <YStack paddingTop={insets.top} backgroundColor="rgba(22, 19, 19, 0.92)" borderBottomWidth={1} borderColor="$border">
          <XStack height={BAR_HEIGHT} alignItems="center" justifyContent="center" paddingHorizontal="$16" gap="$8">
            {variant === 'glow' ? (
              <GlowWordmark size={18} />
            ) : (
              <>
                <Logo variant="mark" size={20} />
                <Text fontFamily="$body" fontWeight="700" fontSize={15} color="$textPrimary">
                  {heading}
                </Text>
              </>
            )}
          </XStack>
        </YStack>
      </Animated.View>
    </YStack>
  )
}
