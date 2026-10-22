import Ionicons from '@expo/vector-icons/Ionicons'
import { api } from '../../convex/_generated/api'
import { useQuery } from 'convex/react'
import { usePathname, useRouter, useSegments } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'
import { Text, useTheme, YStack } from 'tamagui'
const SCREEN_WIDTH = Dimensions.get('window').width
const PANEL_WIDTH = SCREEN_WIDTH * 0.7

type BurgerMenuProps = {
  deviceId?: string
  onboardingMode?: boolean
}

export default function BurgerMenu({ deviceId, onboardingMode }: BurgerMenuProps) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuth, useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user } = useUser()
  const { signOut } = useAuth()
  const router = useRouter()
  const theme = useTheme()
  const pathname = usePathname()
  const segments = useSegments() as string[]
  const slideValue = useRef(new Animated.Value(0)).current
  const [isOpen, setIsOpen] = useState(false)

  const clerkId = user?.id ?? ''
  const isDevUser = useQuery(api.users.isDevUser, clerkId ? { clerk_id: clerkId } : 'skip')

  const resolvedDeviceId = useMemo(() => deviceId ?? '', [deviceId])
  const isOnboardingRoute = segments.includes('onboarding') || pathname.endsWith('/onboarding')
  const isOnboardingMode = onboardingMode ?? isOnboardingRoute

  useEffect(() => {
    Animated.timing(slideValue, {
      toValue: isOpen ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [isOpen, slideValue])

  const closeMenu = () => setIsOpen(false)

  const translateX = slideValue.interpolate({
    inputRange: [0, 1],
    outputRange: [PANEL_WIDTH, 0],
  })

  const overlayOpacity = slideValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  })

  const navigateToPlantList = () => {
    closeMenu()
    router.push('/(home)/(tabs)/plant-list')
  }

  const navigateToGlobalSettings = () => {
    closeMenu()
    router.push('/(home)/(tabs)/global-settings')
  }

  const navigateToDevTools = () => {
    closeMenu()
    router.push('/(home)/devmode')
  }

  const handleLogout = async () => {
    closeMenu()
    await signOut()
    router.replace('/(auth)/sign-in?logout=1')
  }

  return (
    <View pointerEvents="box-none" style={styles.root}>
      {isOpen ? (
        <Pressable style={styles.overlay} onPress={closeMenu}>
          <Animated.View style={[styles.overlayFill, { opacity: overlayOpacity }]} />
        </Pressable>
      ) : null}

      <View pointerEvents="box-none" style={styles.triggerRow}>
        <YStack
          role="button"
          aria-label="Menü"
          onPress={() => setIsOpen((current) => !current)}
          width={44}
          height={44}
          borderRadius="$999"
          borderWidth={1}
          borderColor="$border"
          backgroundColor="$surface press:$surfaceElevated"
          alignItems="center"
          justifyContent="center"
        >
          <Ionicons name={isOpen ? 'close' : 'menu'} size={22} color={theme.textPrimary?.val} />
        </YStack>
      </View>

      <Animated.View
        style={[
          styles.panel,
          {
            backgroundColor: theme.surface?.val,
            borderLeftColor: theme.border?.val,
            transform: [{ translateX }],
            // Eingefahren sonst sichtbarer Schatten am rechten Rand (v. a. im Light Mode).
            shadowOpacity: isOpen ? 0.25 : 0,
            elevation: isOpen ? 20 : 0,
          },
        ]}
      >
        <YStack paddingTop={72} paddingHorizontal="$20" gap="$4">
          <Text fontFamily="$body" fontWeight="600" fontSize={12} letterSpacing={1.2} textTransform="uppercase" color="$textSecondary" marginBottom="$8">
            Menü
          </Text>

          {isOnboardingMode ? null : <MenuItem label="Meine Pflanzen" onPress={navigateToPlantList} />}
          <MenuItem label="Einstellungen" onPress={navigateToGlobalSettings} />
          {!isOnboardingMode && isDevUser ? <MenuItem label="Dev Tools" onPress={navigateToDevTools} /> : null}

          <YStack height={1} backgroundColor="$border" marginVertical="$8" />

          <MenuItem label="Ausloggen" onPress={handleLogout} tone="critical" />

          {resolvedDeviceId ? (
            <Text fontFamily="$body" fontSize={12} color="$textSecondary" marginTop="$12">
              Gerät: {resolvedDeviceId}
            </Text>
          ) : null}
        </YStack>
      </Animated.View>
    </View>
  )
}

function MenuItem({ label, onPress, tone }: { label: string; onPress: () => void; tone?: 'critical' }) {
  return (
    <YStack
      role="button"
      onPress={onPress}
      paddingVertical="$12"
      paddingHorizontal="$8"
      marginHorizontal={-8}
      borderRadius="$8"
      backgroundColor="transparent press:$surfaceElevated"
    >
      <Text fontFamily="$body" fontWeight="600" fontSize={16} color={tone === 'critical' ? '$critical' : '$textPrimary'}>
        {label}
      </Text>
    </YStack>
  )
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  // Abdunklung hinter dem Panel; in beiden Modi neutral schwarz.
  overlayFill: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  triggerRow: {
    position: 'absolute',
    top: 12,
    right: 16,
    zIndex: 52,
  },
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: PANEL_WIDTH,
    height: '100%',
    borderLeftWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: -6, height: 0 },
    shadowRadius: 20,
    zIndex: 53,
  },
})
