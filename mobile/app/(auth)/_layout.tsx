import { Redirect, Stack } from 'expo-router'

export default function AuthRoutesLayout() {
  return <AuthRoutesContent />
}

function AuthRoutesContent() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuth } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { isSignedIn, isLoaded } = useAuth()

  if (!isLoaded) {
    return null
  }

  if (isSignedIn) {
    return <Redirect href="/(home)" />
  }

  return <Stack screenOptions={{ headerShown: false }} />
}