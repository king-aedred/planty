import { Ionicons } from '@expo/vector-icons'
import { Audio } from 'expo-av'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View, Vibration } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const CALL_AUDIO_URI = 'https://api.getplanty.de/audio/veronica.mp3'

export default function DemoCallScreen() {
  const router = useRouter()
  const [isAnswered, setIsAnswered] = useState(false)
  const [secondsElapsed, setSecondsElapsed] = useState(0)
  const [ringSound, setRingSound] = useState<Audio.Sound | null>(null)
  const soundRef = useRef<Audio.Sound | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopCurrentSound = async () => {
    const sound = soundRef.current

    if (!sound) {
      return
    }

    soundRef.current = null

    try {
      await sound.stopAsync()
    } catch {
      // ignore teardown errors
    }

    try {
      await sound.unloadAsync()
    } catch {
      // ignore teardown errors
    }
  }

  const stopRingSound = async () => {
    const sound = ringSound

    if (!sound) {
      return
    }

    setRingSound(null)

    try {
      await sound.stopAsync()
    } catch {
      // ignore teardown errors
    }

    try {
      await sound.unloadAsync()
    } catch {
      // ignore teardown errors
    }
  }

  useEffect(() => {
    Vibration.vibrate([500, 1000, 500, 1000], true)

    let isActive = true

    const playRingtone = async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: 'https://api.getplanty.de/audio/ringtone.mp3' },
          { shouldPlay: true, isLooping: true },
        )

        if (!isActive) {
          await sound.unloadAsync()
          return
        }

        setRingSound(sound)
      } catch (error) {
        console.error('[demo-call] failed to start ringtone', error)
      }
    }

    void playRingtone()

    return () => {
      isActive = false
      Vibration.cancel()

      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }

      void stopRingSound()
      void stopCurrentSound()
    }
  }, [])

  useEffect(() => {
    if (!isAnswered) {
      return
    }

    let isActive = true

    const startCallAudio = async () => {
      try {
        await stopRingSound()

        const { sound } = await Audio.Sound.createAsync(
          { uri: CALL_AUDIO_URI },
          { shouldPlay: true },
        )

        if (!isActive) {
          await sound.unloadAsync()
          return
        }

        soundRef.current = sound
      } catch (error) {
        console.error('[demo-call] failed to start audio', error)
      }
    }

    Vibration.cancel()
    setSecondsElapsed(0)

    intervalRef.current = setInterval(() => {
      setSecondsElapsed((value) => value + 1)
    }, 1000)

    void startCallAudio()

    return () => {
      isActive = false

      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isAnswered])

  const handleAnswer = () => {
    setIsAnswered(true)
  }

  const handleHangUp = async () => {
    Vibration.cancel()

    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    await stopCurrentSound()
    router.back()
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {!isAnswered ? (
        <View style={styles.incomingContainer}>
          <Text style={styles.incomingLabel}>Eingehender Anruf</Text>

          <View style={styles.avatar}>
            <Text style={styles.avatarEmoji}>🌿</Text>
          </View>

          <Text style={styles.callerName}>Veronica</Text>
          <Text style={styles.callerSubtitle}>Chinesische Feige • Planty</Text>

          <View style={styles.answerBlock}>
            <Pressable
              accessibilityRole="button"
              onPress={handleAnswer}
              style={({ pressed }) => [styles.answerButton, pressed && styles.answerButtonPressed]}
            >
              <Ionicons name="call" size={34} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.answerLabel}>Annehmen</Text>
          </View>
        </View>
      ) : (
        <View style={styles.callContainer}>
          <View style={styles.callHeader}>
            <Text style={styles.callName}>Veronica</Text>
            <Text style={styles.callSubtitle}>Chinesische Feige</Text>
          </View>

          <View style={styles.callCenter}>
            <Text style={styles.timer}>{formatTimer(secondsElapsed)}</Text>
          </View>

          <View style={styles.hangupBlock}>
            <Pressable
              accessibilityRole="button"
              onPress={handleHangUp}
              style={({ pressed }) => [styles.hangupButton, pressed && styles.hangupButtonPressed]}
            >
              <Ionicons name="call" size={34} color="#FFFFFF" style={styles.hangupIcon} />
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  )
}

function formatTimer(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  incomingContainer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 28,
    paddingBottom: 56,
  },
  incomingLabel: {
    fontSize: 16,
    color: '#8A8A8A',
    fontWeight: '500',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1E8E3E',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1E8E3E',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  avatarEmoji: {
    fontSize: 48,
  },
  callerName: {
    fontSize: 32,
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
  },
  callerSubtitle: {
    fontSize: 14,
    color: '#8A8A8A',
    textAlign: 'center',
  },
  answerBlock: {
    alignItems: 'center',
    gap: 10,
  },
  answerButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#1E8E3E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerButtonPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.92,
  },
  answerLabel: {
    fontSize: 13,
    color: '#D0D0D0',
  },
  callContainer: {
    flex: 1,
    backgroundColor: '#000000',
    paddingTop: 20,
    paddingBottom: 54,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  callHeader: {
    alignItems: 'center',
    gap: 4,
  },
  callName: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  callSubtitle: {
    fontSize: 14,
    color: '#8A8A8A',
  },
  callCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  timer: {
    fontSize: 54,
    color: '#FFFFFF',
    fontWeight: '300',
    letterSpacing: 1.5,
  },
  hangupBlock: {
    alignItems: 'center',
  },
  hangupButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#D93025',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hangupButtonPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.92,
  },
  hangupIcon: {
    transform: [{ rotate: '135deg' }],
  },
})