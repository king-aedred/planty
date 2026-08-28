import type { ReactNode } from 'react'
import { type Edge, SafeAreaView } from 'react-native-safe-area-context'
import { YStack } from 'tamagui'

type ScreenProps = {
  children: ReactNode
  edges?: Edge[]
}

export function Screen({ children, edges = ['top'] }: ScreenProps) {
  return (
    <YStack flex={1} backgroundColor="$background">
      <SafeAreaView edges={edges} style={{ flex: 1 }}>
        {children}
      </SafeAreaView>
    </YStack>
  )
}
