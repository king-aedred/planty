import { Redirect, Stack, useLocalSearchParams } from 'expo-router'

export default function AuthRoutesLayout() {
  return <AuthRoutesContent />
}

function AuthRoutesContent() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuth } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { isSignedIn, isLoaded } = useAuth()
  const params = useLocalSearchParams<{ logout?: string }>()
  const isLogoutFlow = params.logout === '1'

  if (!isLoaded) {
    return null
  }

  if (isSignedIn && !isLogoutFlow) {
    return <Redirect href="/(home)" />
  }

  return (
    <Stack screenOptions={{ animation: 'slide_from_right', headerShown: false }}>
      <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
      {/* Login und Registrieren ohne Stack-Animation: Den Übergang übernehmen Logo und Box (AuthShell). */}
      <Stack.Screen name="sign-in" options={{ animation: 'none' }} />
      <Stack.Screen name="sign-up" options={{ animation: 'none' }} />
    </Stack>
  )
}