import { useEffect, useRef } from 'react'
import { Animated } from 'react-native'
import Svg, { Circle, Ellipse, Path } from 'react-native-svg'
import { YStack } from 'tamagui'

// Pflanzen-Avatare aus dem Stitch-Template. Die Gesichter sind Illustrationen: Ihre Farben stehen
// bewusst fest in dieser Datei (wie bei einem Bild) und wechseln nicht mit Dark/Light.
const ART = {
  ink: '#161313',
  white: '#FFFFFF',
  leaf: '#75DB9D',
  gold: '#F0BF4C',
  rose: '#E87D98',
  coral: '#E8635E',
  orange: '#F5993D',
  teal: '#78BAAD',
}

export type PlantMood = 'happy' | 'grumpy' | 'neutral' | 'sad'
export type PlantStatusTone = 'success' | 'warning' | 'critical' | 'neutral'

const MOODS: Record<PlantMood, { background: string; ring: string }> = {
  happy: { background: '$characterHappySoft', ring: '$characterHappy' },
  grumpy: { background: '$characterGrumpySoft', ring: '$characterGrumpy' },
  neutral: { background: '$characterNeutralSoft', ring: '$characterNeutral' },
  sad: { background: '$criticalSoft', ring: '$critical' },
}

const STATUS_DOT: Record<PlantStatusTone, string> = {
  success: '$success',
  warning: '$warning',
  critical: '$critical',
  neutral: '$outline',
}

function Face({ mood, size }: { mood: PlantMood; size: number }) {
  if (mood === 'happy') {
    return (
      <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
        <Path d="M18 7C19.5 3 24 3.5 25 6C26 8.5 22 10.5 18 10" fill={ART.leaf} stroke={ART.ink} strokeWidth={1} />
        <Circle cx={18} cy={20} r={12} fill={ART.gold} />
        <Ellipse cx={14} cy={19} rx={1.6} ry={2.2} fill={ART.ink} />
        <Ellipse cx={22} cy={19} rx={1.6} ry={2.2} fill={ART.ink} />
        <Circle cx={14.6} cy={18.2} r={0.6} fill={ART.white} />
        <Circle cx={22.6} cy={18.2} r={0.6} fill={ART.white} />
        <Path d="M15 23C16.2 24.8 19.8 24.8 21 23" stroke={ART.ink} strokeWidth={1.6} strokeLinecap="round" />
        <Ellipse cx={11.5} cy={22} rx={1.8} ry={1} fill={ART.rose} opacity={0.7} />
        <Ellipse cx={24.5} cy={22} rx={1.8} ry={1} fill={ART.rose} opacity={0.7} />
      </Svg>
    )
  }
  if (mood === 'grumpy') {
    return (
      <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
        <Path d="M18 8C16 4 11 5 12 8C13 11 17 11 18 10" fill={ART.orange} stroke={ART.ink} strokeWidth={1} />
        <Circle cx={18} cy={20} r={12} fill={ART.rose} />
        <Path d="M12 18.5L16 19.5" stroke={ART.ink} strokeWidth={1.8} strokeLinecap="round" />
        <Path d="M24 18.5L20 19.5" stroke={ART.ink} strokeWidth={1.8} strokeLinecap="round" />
        <Circle cx={14} cy={21} r={1.2} fill={ART.ink} />
        <Circle cx={22} cy={21} r={1.2} fill={ART.ink} />
        <Path d="M16 25C17.5 24 18.5 24 20 25" stroke={ART.ink} strokeWidth={1.6} strokeLinecap="round" />
        <Ellipse cx={11} cy={22.5} rx={1.6} ry={0.9} fill={ART.orange} opacity={0.8} />
        <Ellipse cx={25} cy={22.5} rx={1.6} ry={0.9} fill={ART.orange} opacity={0.8} />
      </Svg>
    )
  }
  if (mood === 'sad') {
    return (
      <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
        <Path d="M18 9C19 5 22 5 21 8C20 10.5 18.5 11 18 10.5" fill={ART.coral} stroke={ART.ink} strokeWidth={1} />
        <Path d="M17 10C15 6 12 7 13 9.5" fill={ART.orange} stroke={ART.ink} strokeWidth={0.8} />
        <Circle cx={18} cy={20} r={12} fill={ART.coral} />
        <Ellipse cx={13.5} cy={18.5} rx={1.8} ry={2.5} fill={ART.ink} />
        <Ellipse cx={22.5} cy={18.5} rx={1.8} ry={2.5} fill={ART.ink} />
        <Circle cx={14} cy={17.5} r={0.7} fill={ART.white} />
        <Circle cx={23} cy={17.5} r={0.7} fill={ART.white} />
        <Path d="M15 24.5C16.5 23.5 19.5 23.5 21 24.5" stroke={ART.ink} strokeWidth={1.8} strokeLinecap="round" />
        <Path d="M26 18C27 19.5 27 21 26 21.5C25 21 25 19.5 26 18Z" fill={ART.leaf} />
      </Svg>
    )
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <Circle cx={18} cy={7} r={2.5} fill={ART.leaf} stroke={ART.ink} strokeWidth={0.8} />
      <Path d="M18 9.5V11" stroke={ART.ink} strokeWidth={1} />
      <Circle cx={18} cy={20} r={12} fill={ART.teal} />
      <Path d="M12 18.5C13.5 17 15.5 17 17 18.5" stroke={ART.ink} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M19 18.5C20.5 17 22.5 17 24 18.5" stroke={ART.ink} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M16 22.5C17 24.2 19 24.2 20 22.5" stroke={ART.ink} strokeWidth={1.6} strokeLinecap="round" />
      <Ellipse cx={11.5} cy={21} rx={1.6} ry={0.9} fill={ART.gold} opacity={0.7} />
      <Ellipse cx={24.5} cy={21} rx={1.6} ry={0.9} fill={ART.gold} opacity={0.7} />
    </Svg>
  )
}

// Langsames Pulsieren für den kritischen Zustand (verspieltes Detail aus dem Template).
function usePulse(active: boolean) {
  const value = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (!active) {
      value.setValue(1)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 0.55, duration: 900, useNativeDriver: true }),
        Animated.timing(value, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [active, value])
  return value
}

type PlantAvatarProps = {
  mood: PlantMood
  status: PlantStatusTone
  // Durchmesser in px (Standard 44 wie im Template).
  size?: number
}

export function PlantAvatar({ mood, status, size = 44 }: PlantAvatarProps) {
  const colors = MOODS[mood]
  const pulse = usePulse(status === 'critical')

  return (
    <YStack position="relative" width={size} height={size}>
      <Animated.View style={{ opacity: pulse }}>
        <YStack
          width={size}
          height={size}
          borderRadius="$999"
          backgroundColor={colors.background}
          borderWidth={1}
          borderColor={colors.ring}
          alignItems="center"
          justifyContent="center"
          opacity={1}
        >
          <Face mood={mood} size={Math.round(size * 0.73)} />
        </YStack>
      </Animated.View>
      <YStack
        position="absolute"
        bottom={-1}
        right={-1}
        width={10}
        height={10}
        borderRadius="$999"
        backgroundColor={STATUS_DOT[status]}
        borderWidth={2}
        borderColor="$surface"
      />
    </YStack>
  )
}

// Topf-Illustration für den Leerzustand (aus dem Template).
export function EmptyPotIllustration({ size = 56 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Path d="M32 34V16" stroke={ART.leaf} strokeWidth={2.5} strokeLinecap="round" />
      <Path d="M32 24C38 18 46 20 46 26C46 32 38 33 32 33" fill={ART.leaf} />
      <Path d="M32 20C26 14 18 16 18 22C18 28 26 29 32 29" fill="#92F7B8" />
      <Path d="M32 16C34 10 40 8 43 12C46 16 41 21 32 21" fill={ART.leaf} />
      <Path d="M22 36L25 50C25.3 51.5 26.6 52.5 28.2 52.5H35.8C37.4 52.5 38.7 51.5 39 50L42 36H22Z" fill="#483A89" />
      <Path d="M21 33C21 32.4 21.4 32 22 32H42C42.6 32 43 32.4 43 33V36H21V33Z" fill="#5844C1" />
      <Circle cx={29} cy={42} r={1.5} fill={ART.white} />
      <Circle cx={35} cy={42} r={1.5} fill={ART.white} />
      <Path d="M30.5 45.5C31.5 46.5 32.5 46.5 33.5 45.5" stroke={ART.white} strokeWidth={1.2} strokeLinecap="round" />
      <Circle cx={48} cy={14} r={1.2} fill="#CABEFF" />
      <Path d="M48 9L49 12L52 13L49 14L48 17L47 14L44 13L47 12Z" fill="#CABEFF" opacity={0.85} />
    </Svg>
  )
}
