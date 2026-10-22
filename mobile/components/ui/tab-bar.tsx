import Ionicons from '@expo/vector-icons/Ionicons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import type { ComponentProps } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, useTheme, XStack, YStack } from 'tamagui'

type IconName = ComponentProps<typeof Ionicons>['name']

export const TAB_ITEMS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  'plant-list': { label: 'Pflanzen', icon: 'leaf-outline', iconActive: 'leaf' },
  inbox: { label: 'Nachrichten', icon: 'chatbubble-outline', iconActive: 'chatbubble' },
  sensors: { label: 'Sensoren', icon: 'radio-outline', iconActive: 'radio' },
  'global-settings': { label: 'Einstellungen', icon: 'settings-outline', iconActive: 'settings' },
}

// Höhe der Leiste plus Abstand; Screens in den Tabs halten unten so viel Platz frei.
export const TAB_BAR_SPACE = 96

type TabBarProps = BottomTabBarProps & {
  // Routen mit Punkt (z. B. ungelesene Nachrichten).
  dots?: Record<string, boolean>
}

// Schwebende Tab-Leiste nach dem Stitch-Template: abgerundete Fläche, aktiver Tab in Akzenttext.
// ABWEICHUNG: kein Unschärfe-Effekt (expo-blur ist nicht installiert), stattdessen halbtransparente Fläche.
export function TabBar({ state, navigation, dots = {} }: TabBarProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <YStack position="absolute" left={0} right={0} bottom={0} paddingHorizontal="$16" paddingBottom={Math.max(insets.bottom, 8)} pointerEvents="box-none">
      <XStack
        height={64}
        borderRadius="$999"
        backgroundColor="$surfaceElevated"
        borderWidth={1}
        borderColor="$border"
        alignItems="center"
        justifyContent="space-around"
        paddingHorizontal="$4"
        // Tamagui 3: Schatten über boxShadow (shadow*/elevation gibt es nicht mehr).
        boxShadow="0px 8px 24px rgba(0, 0, 0, 0.45)"
      >
        {state.routes.map((route, index) => {
          const item = TAB_ITEMS[route.name]
          if (!item) return null
          const isActive = state.index === index
          const color = isActive ? theme.accentText?.val : theme.textSecondary?.val

          return (
            <YStack
              key={route.key}
              role="tab"
              aria-selected={isActive}
              aria-label={item.label}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
                if (!isActive && !event.defaultPrevented) navigation.navigate(route.name)
              }}
              alignItems="center"
              justifyContent="center"
              gap="$2"
              minWidth={64}
              minHeight={44}
              paddingVertical="$4"
              borderRadius="$999"
              opacity="1 press:0.7"
            >
              <YStack position="relative">
                <Ionicons name={isActive ? item.iconActive : item.icon} size={22} color={color} />
                {dots[route.name] ? (
                  <YStack position="absolute" top={-2} right={-4} width={8} height={8} borderRadius="$999" backgroundColor="$accentText" />
                ) : null}
              </YStack>
              <Text fontFamily="$body" fontWeight={isActive ? '700' : '600'} fontSize={10} letterSpacing={0.6} textTransform="uppercase" color={isActive ? '$accentText' : '$textSecondary'}>
                {item.label}
              </Text>
            </YStack>
          )
        })}
      </XStack>
    </YStack>
  )
}
