import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { Stack } from 'expo-router'

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL

if (!publishableKey) {
  throw new Error('Add your Clerk Publishable Key to the .env file')
}

if (!convexUrl) {
  throw new Error('Add your Convex URL to the .env file')
}

const clerkPublishableKey = publishableKey
const convex = new ConvexReactClient(convexUrl)

export default function RootLayout() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ClerkProvider } = require('@clerk/expo') as typeof import('@clerk/expo')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tokenCache } = require('@clerk/expo/token-cache') as typeof import('@clerk/expo/token-cache')

  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <ConvexProvider client={convex}>
        <Stack screenOptions={{ headerShown: false }} />
      </ConvexProvider>
    </ClerkProvider>
  )
}