import type { ReactNode } from 'react'
import { YStack } from 'tamagui'

type CardProps = {
  children: ReactNode
}

export function Card({ children }: CardProps) {
  return (
    <YStack
      backgroundColor="$surface"
      borderWidth={1}
      borderColor="$border"
      borderRadius="$12"
      padding="$20"
      gap="$12"
    >
      {children}
    </YStack>
  )
}
