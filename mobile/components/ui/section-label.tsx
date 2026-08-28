import type { ReactNode } from 'react'
import { Text } from 'tamagui'

type SectionLabelProps = {
  children: ReactNode
}

export function SectionLabel({ children }: SectionLabelProps) {
  return (
    <Text
      fontFamily="$heading"
      color="$textSecondary"
      fontSize={12}
      letterSpacing={1.6}
      textTransform="uppercase"
    >
      {children}
    </Text>
  )
}
