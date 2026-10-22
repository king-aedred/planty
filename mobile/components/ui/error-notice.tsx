import Ionicons from '@expo/vector-icons/Ionicons'
import { Text, useTheme, XStack, YStack } from 'tamagui'
import { Button } from './button'

type ErrorNoticeProps = {
  message: string
  title?: string
  onRetry?: () => void
  retryLabel?: string
}

// Fehlerhinweis im Inhalt: gedämpfte Fläche, Symbol in Fehlerfarbe, Text in normaler Textfarbe.
export function ErrorNotice({ message, title, onRetry, retryLabel = 'Erneut versuchen' }: ErrorNoticeProps) {
  const theme = useTheme()

  return (
    <YStack backgroundColor="$criticalSoft" borderRadius="$12" padding="$12" gap="$8">
      <XStack gap="$8" alignItems="flex-start">
        <Ionicons name="alert-circle-outline" size={20} color={theme.critical?.val} />
        <YStack flex={1} gap="$2">
          {title ? (
            <Text fontFamily="$body" fontWeight="600" fontSize={14} color="$textPrimary">
              {title}
            </Text>
          ) : null}
          <Text fontFamily="$body" fontSize={14} lineHeight="$4" color="$textPrimary">
            {message}
          </Text>
        </YStack>
      </XStack>
      {onRetry ? (
        <XStack justifyContent="flex-end">
          <Button variant="ghost" onPress={onRetry}>
            {retryLabel}
          </Button>
        </XStack>
      ) : null}
    </YStack>
  )
}
