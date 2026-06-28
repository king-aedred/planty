import { Redirect } from 'expo-router'

export default function Index() {
  return <IndexContent />
}

function IndexContent() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuth } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { isLoaded, isSignedIn } = useAuth()

  if (!isLoaded) {
    return null
  }

  return <Redirect href={isSignedIn ? '/(home)' : '/(auth)/sign-in'} />
}