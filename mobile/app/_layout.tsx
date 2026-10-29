// Muss vor allem anderen laden: Tamagui 3 braucht `usePressability` aus react-native (siehe Datei).
import '../polyfills/react-native-use-pressability'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { ConvexReactClient } from 'convex/react'
import { useMutation } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { ClerkProvider } from '@clerk/expo'
import { tokenCache } from '@clerk/expo/token-cache'
import { api } from '../../convex/_generated/api'
import { Stack } from 'expo-router'
import { Platform, useColorScheme } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useEffect, type ReactNode, useRef } from 'react'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue'
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk'
import { TamaguiProvider } from 'tamagui'
import { LoadingScreen } from '../components/ui/loading-screen'
import { tamaguiConfig } from '../tamagui.config'

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

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  // Dark und Light folgen der Systemeinstellung; Dark ist der Standard, falls das System nichts meldet.
  const colorScheme = useColorScheme() === 'light' ? 'light' : 'dark'
  const [fontsLoaded, fontError] = useFonts({
    BebasNeue_400Regular,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  })

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded, fontError])

  if (!fontsLoaded && !fontError) {
    return null
  }

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
        <ClerkLoadingGate>
          <ConvexWithClerk>
            <PushTokenRegistration />
            <Stack screenOptions={{ animation: 'slide_from_right', headerShown: false }}>
              <Stack.Screen name="demo-call" options={{ headerShown: false }} />
            </Stack>
          </ConvexWithClerk>
        </ClerkLoadingGate>
      </ClerkProvider>
    </TamaguiProvider>
  )
}

function ClerkLoadingGate({ children }: { children: ReactNode }) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuth } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { isLoaded } = useAuth()

  if (!isLoaded) {
    return (
      <LoadingScreen />
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
        // Erfragt wird die Erlaubnis im Onboarding bzw. in den Einstellungen; hier nur das Token auffrischen.
        const permissionResult = await Notifications.getPermissionsAsync()

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
