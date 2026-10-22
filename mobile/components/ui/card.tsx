import type { ReactNode } from 'react'
import { YStack } from 'tamagui'

type CardProps = {
  children: ReactNode
  // Engerer Innenabstand für Listen in Karten.
  dense?: boolean
}

// Ruhige Fläche mit dünnem Rahmen und runden Ecken.
export function Card({ children, dense = false }: CardProps) {
  return (
    <YStack
      backgroundColor="$surface"
      borderWidth={1}
      borderColor="$border"
      borderRadius="$16"
      padding={dense ? '$4' : '$16'}
      gap={dense ? 0 : '$12'}
      overflow="hidden"
    >
      {children}
    </YStack>
  )
}
