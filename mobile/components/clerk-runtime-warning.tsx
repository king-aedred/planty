import { Colors } from '@/constants/colors'
import { Pressable, StyleSheet, Text, View } from 'react-native'

const colors = Colors.dark

export function ClerkRuntimeWarning() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Planty</Text>
        <Text style={styles.title}>Clerk braucht einen Dev Build</Text>
        <Text style={styles.subtitle}>
          Die aktuelle Expo-Go-Runtime stellt das native Modul `ClerkExpo` nicht bereit.
          Starte stattdessen einen Development Build mit `expo-dev-client`, damit Login und
          Registrierung funktionieren.
        </Text>

        <Pressable style={styles.button} onPress={() => {}}>
          <Text style={styles.buttonText}>Info anzeigen</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 28,
    padding: 20,
    gap: 12,
  },
  eyebrow: {
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonText: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: '700',
  },
})
