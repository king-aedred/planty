import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { ConvexReactClient } from 'convex/react'
import { useMutation } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { ClerkProvider } from '@clerk/expo'
import { tokenCache } from '@clerk/expo/token-cache'
import { api } from '../../convex/_generated/api'
import { Stack } from 'expo-router'
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native'
import { useEffect, type ReactNode, useRef } from 'react'

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

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <ClerkLoadingGate>
        <ConvexWithClerk>
          <PushTokenRegistration />
          <Stack screenOptions={{ animation: 'slide_from_right', headerShown: false }} />
        </ConvexWithClerk>
      </ClerkLoadingGate>
    </ClerkProvider>
  )
}

function ClerkLoadingGate({ children }: { children: ReactNode }) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuth } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { isLoaded } = useAuth()

  if (!isLoaded) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#7FD38A" />
      </View>
    )
  }

  return children
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

function PushTokenRegistration() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user, isLoaded, isSignedIn } = useUser()
  const clerkId = user?.id ?? ''
  const updatePushToken = useMutation(api.users.updatePushToken)
  const hasRegisteredPushTokenRef = useRef(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !clerkId || hasRegisteredPushTokenRef.current) {
      return
    }

    if (Platform.OS === 'web') {
      hasRegisteredPushTokenRef.current = true
      return
    }

    hasRegisteredPushTokenRef.current = true

    const registerPushToken = async () => {
      try {
        const permissionResult = await Notifications.requestPermissionsAsync()

        if (!permissionResult.granted) {
          return
        }

        const projectId = Constants.expoConfig?.extra?.eas?.projectId

        if (!projectId) {
          console.error('[push] Missing Expo projectId, skipping push token registration')
          return
        }

        const expoPushToken = await Notifications.getExpoPushTokenAsync({
          projectId,
        })

        if (!expoPushToken.data) {
          return
        }

        await updatePushToken({
          clerk_id: clerkId,
          token: expoPushToken.data,
        })
      } catch (error) {
        console.error('[push] Failed to register Expo push token', error)
      }
    }

    void registerPushToken()
  }, [clerkId, isLoaded, isSignedIn, updatePushToken])

  return null
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: '#07130F',
    alignItems: 'center',
    justifyContent: 'center',
  },
})