import { type ReactNode, useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet } from 'react-native'
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { YStack } from 'tamagui'

type BottomSheetProps = {
  visible: boolean
  onClose: () => void
  children: ReactNode
}

// Blatt von unten über dem Screen, Hintergrund dunkelt ab; Tippen daneben schließt. Für Rückfragen und kurze Formulare.
export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  const insets = useSafeAreaInsets()
  const [isMounted, setIsMounted] = useState(visible)
  const progress = useSharedValue(0)

  useEffect(() => {
    if (visible) {
      setIsMounted(true)
      progress.value = withTiming(1, { duration: 340, easing: Easing.out(Easing.cubic) })
    } else if (isMounted) {
      progress.value = withTiming(0, { duration: 240, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) {
          runOnJS(setIsMounted)(false)
        }
      })
    }
  }, [isMounted, progress, visible])

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }))
  const sheetStyle = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateY: (1 - progress.value) * 60 }] }))

  return (
    <Modal visible={isMounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Schließen">
          <YStack flex={1} backgroundColor="rgba(0,0,0,0.6)" />
        </Pressable>
      </Animated.View>
      <Animated.View style={[styles.sheet, sheetStyle]} pointerEvents="box-none">
        <YStack
          backgroundColor="$surface"
          borderTopLeftRadius="$16"
          borderTopRightRadius="$16"
          borderWidth={1}
          borderColor="$border"
          width="100%"
          maxWidth={560}
          alignSelf="center"
          paddingTop="$12"
          paddingHorizontal="$20"
          paddingBottom={Math.max(insets.bottom, 16) + 4}
          gap="$16"
        >
          <YStack alignSelf="center" width={40} height={4} borderRadius="$999" backgroundColor="$borderStrong" />
          {children}
        </YStack>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({ sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 } })
