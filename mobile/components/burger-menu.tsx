import { Colors } from '@/constants/colors'
import { api } from '../../convex/_generated/api'
import { useQuery } from 'convex/react'
import { useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

const colors = Colors.dark
const SCREEN_WIDTH = Dimensions.get('window').width
const PANEL_WIDTH = SCREEN_WIDTH * 0.7

type BurgerMenuProps = {
  deviceId?: string
}

export default function BurgerMenu({ deviceId }: BurgerMenuProps) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuth, useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user } = useUser()
  const { signOut } = useAuth()
  const router = useRouter()
  const slideValue = useRef(new Animated.Value(0)).current
  const [isOpen, setIsOpen] = useState(false)

  const clerkId = user?.id ?? ''
  const isDevUser = useQuery(api.users.isDevUser, clerkId ? { clerk_id: clerkId } : 'skip')

  const resolvedDeviceId = useMemo(() => deviceId ?? '', [deviceId])

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

  const navigateToStatus = () => {
    closeMenu()
    router.push('/(home)/status')
  }

  const navigateToPlantList = () => {
    closeMenu()
    router.push('/(home)/plant-list')
  }

  const navigateToGlobalSettings = () => {
    closeMenu()
    router.push('/(home)/global-settings')
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
        <Pressable accessibilityRole="button" onPress={() => setIsOpen((current) => !current)} style={styles.trigger}>
          <View style={styles.burgerLine} />
          <View style={styles.burgerLine} />
          <View style={styles.burgerLine} />
        </Pressable>
      </View>

      <Animated.View style={[styles.panel, { transform: [{ translateX }] }]}>
        <View style={styles.panelContent}>
          <Text style={styles.panelTitle}>Menü</Text>

          <Pressable style={styles.menuItem} onPress={navigateToStatus}>
            <Text style={styles.menuItemText}>Status</Text>
          </Pressable>

          <Pressable style={styles.menuItem} onPress={navigateToPlantList}>
            <Text style={styles.menuItemText}>Meine Pflanzen</Text>
          </Pressable>

                  <Pressable style={styles.menuItem} onPress={navigateToGlobalSettings}>
                    <Text style={styles.menuItemText}>⚙️ Einstellungen</Text>
                  </Pressable>

          {isDevUser ? (
            <Pressable style={styles.menuItem} onPress={navigateToDevTools}>
              <Text style={styles.menuItemText}>Dev Tools</Text>
            </Pressable>
          ) : null}

          <View style={styles.separator} />

          <Pressable style={styles.menuItem} onPress={handleLogout}>
            <Text style={[styles.menuItemText, styles.logoutText]}>Ausloggen</Text>
          </Pressable>

          {resolvedDeviceId ? <Text style={styles.deviceHint}>Device: {resolvedDeviceId}</Text> : null}
        </View>
      </Animated.View>
    </View>
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
  trigger: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    gap: 4,
  },
  burgerLine: {
    width: 18,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.text,
  },
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: PANEL_WIDTH,
    height: '100%',
    backgroundColor: colors.background,
    borderLeftColor: colors.border,
    borderLeftWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: -6, height: 0 },
    shadowRadius: 20,
    elevation: 20,
    zIndex: 53,
  },
  panelContent: {
    paddingTop: 72,
    paddingHorizontal: 20,
    gap: 12,
  },
  panelTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  menuItem: {
    paddingVertical: 10,
  },
  menuItemText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  logoutText: {
    color: colors.danger,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  deviceHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 10,
  },
})