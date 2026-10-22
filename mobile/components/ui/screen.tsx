import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { type Edge, SafeAreaView } from 'react-native-safe-area-context'
import { YStack } from 'tamagui'

type ScreenProps = {
  children: ReactNode
  edges?: Edge[]
  // Inhalt scrollbar machen (lange Screens). Standard: nein.
  scroll?: boolean
  // Seitenränder und Abstand zwischen Abschnitten. Standard: ja.
  padded?: boolean
}

// Screen-Container: Hintergrund aus dem Theme, Safe Area, großzügiger Rand.
export function Screen({ children, edges = ['top'], scroll = false, padded = true }: ScreenProps) {
  const content = (
    <YStack flex={scroll ? undefined : 1} padding={padded ? '$16' : 0} gap={padded ? '$16' : 0}>
      {children}
    </YStack>
  )

  return (
    <YStack flex={1} backgroundColor="$background">
      <SafeAreaView edges={edges} style={{ flex: 1 }}>
        {scroll ? (
          // Formulare: Tastatur schiebt den Inhalt hoch statt ihn zu verdecken.
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
              {content}
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          content
        )}
      </SafeAreaView>
    </YStack>
  )
}
