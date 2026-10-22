import { ActivityIndicator } from 'react-native'
import { useTheme, YStack } from 'tamagui'

// Vollflächiger Ladezustand (Auth-Prüfung, Weiterleitung).
export function LoadingScreen() {
  const theme = useTheme()

  return (
    <YStack flex={1} backgroundColor="$background" alignItems="center" justifyContent="center">
      <ActivityIndicator size="large" color={theme.accentText?.val} />
    </YStack>
  )
}
