import Ionicons from '@expo/vector-icons/Ionicons'
import type { ComponentProps } from 'react'
import { Text, useTheme, YStack } from 'tamagui'
import { Button } from './button'

type EmptyStateProps = {
  title: string
  text?: string
  icon?: ComponentProps<typeof Ionicons>['name']
  action?: { label: string; onPress: () => void }
}

// Leerzustand: ruhig, zentriert, höchstens eine Aktion.
export function EmptyState({ title, text, icon = 'leaf-outline', action }: EmptyStateProps) {
  const theme = useTheme()

  return (
    <YStack alignItems="center" gap="$12" paddingVertical="$32" paddingHorizontal="$16">
      <YStack
        width={56}
        height={56}
        borderRadius="$999"
        backgroundColor="$surfaceElevated"
        alignItems="center"
        justifyContent="center"
      >
        <Ionicons name={icon} size={26} color={theme.textSecondary?.val} />
      </YStack>
      <Text fontFamily="$body" fontWeight="600" fontSize={17} color="$textPrimary" textAlign="center">
        {title}
      </Text>
      {text ? (
        <Text fontFamily="$body" fontSize={14} lineHeight="$4" color="$textSecondary" textAlign="center" maxWidth={320}>
          {text}
        </Text>
      ) : null}
      {action ? (
        <YStack paddingTop="$8" alignSelf="stretch">
          <Button onPress={action.onPress}>{action.label}</Button>
        </YStack>
      ) : null}
    </YStack>
  )
}
