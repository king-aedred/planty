import { ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { ClerkProvider } from '@clerk/expo'
import { tokenCache } from '@clerk/expo/token-cache'
import { Stack } from 'expo-router'
import type { ReactNode } from 'react'

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
  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <ConvexWithClerk>
        <Stack screenOptions={{ headerShown: false }} />
      </ConvexWithClerk>
    </ClerkProvider>
  )
}

function ConvexWithClerk({ children }: { children: ReactNode }) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuth, useSession } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { session } = useSession()

  return (
    <ConvexProviderWithClerk key={session?.id ?? 'signed-out'} client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  )
}