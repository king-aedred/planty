import { Button } from '@/components/ui/button'
import { SectionLabel } from '@/components/ui/section-label'
import { TERMS_OF_USE } from '@/constants/legal'
import { useEffect, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet } from 'react-native'
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, YStack } from 'tamagui'

type TermsSheetProps = {
  visible: boolean
  onClose: () => void
  // Optional: „Akzeptieren“ setzt den Haken im Formular und schließt.
  onAccept?: () => void
}

// Nutzungsbedingungen als Blatt von unten über dem Formular; der Hintergrund dunkelt ab.
export function TermsSheet({ visible, onClose, onAccept }: TermsSheetProps) {
  const insets = useSafeAreaInsets()
  const [isMounted, setIsMounted] = useState(visible)
  const progress = useSharedValue(0)

  useEffect(() => {
    if (visible) {
      setIsMounted(true)
      progress.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) })
    } else if (isMounted) {
      progress.value = withTiming(0, { duration: 260, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) {
          runOnJS(setIsMounted)(false)
        }
      })
    }
  }, [isMounted, progress, visible])

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }))
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 60 }],
  }))

  return (
    <Modal visible={isMounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Schließen">
          <YStack flex={1} backgroundColor="rgba(0,0,0,0.6)" />
        </Pressable>
      </Animated.View>

      <Animated.View style={[styles.sheetWrap, sheetStyle]} pointerEvents="box-none">
        <YStack
          backgroundColor="$surface"
          borderTopLeftRadius="$16"
          borderTopRightRadius="$16"
          borderWidth={1}
          borderColor="$border"
          maxHeight="85%"
          width="100%"
          maxWidth={560}
          alignSelf="center"
          paddingTop="$12"
          paddingHorizontal="$20"
          paddingBottom={Math.max(insets.bottom, 16) + 4}
          gap="$16"
        >
          <YStack alignSelf="center" width={40} height={4} borderRadius="$999" backgroundColor="$borderStrong" />

          <YStack gap="$4">
            <SectionLabel>{TERMS_OF_USE.status}</SectionLabel>
            <Text fontFamily="$heading" color="$textPrimary" fontSize="$8">
              {TERMS_OF_USE.title}
            </Text>
          </YStack>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 16, paddingBottom: 4 }}>
            {TERMS_OF_USE.sections.map((section) => (
              <YStack key={section.heading} gap="$4">
                <Text fontFamily="$body" fontWeight="700" fontSize={15} color="$textPrimary">
                  {section.heading}
                </Text>
                <Text fontFamily="$body" fontSize={14} lineHeight="$4" color="$textSecondary">
                  {section.body}
                </Text>
              </YStack>
            ))}
          </ScrollView>

          <YStack gap="$8">
            {onAccept ? <Button onPress={onAccept}>Akzeptieren</Button> : null}
            <Button variant={onAccept ? 'ghost' : 'secondary'} onPress={onClose}>
              Schließen
            </Button>
          </YStack>
        </YStack>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
})
