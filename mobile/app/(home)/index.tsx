import { Colors } from '@/constants/colors'
import { api } from '../../../convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

const colors = Colors.dark

export default function Page() {
  return <HomeContent />
}

function HomeContent() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useClerk, useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user, isLoaded, isSignedIn } = useUser()
  const { signOut } = useClerk()
  const createUser = useMutation(api.users.createUser)
  const hasCreatedUserRef = useRef(false)

  const clerkId = user?.id ?? ''
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? ''

  const existingUser = useQuery(
    api.users.getUserByClerkId,
    isLoaded && isSignedIn && clerkId ? { clerk_id: clerkId } : 'skip',
  )

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !clerkId) {
      return
    }

    if (existingUser === undefined || existingUser !== null || hasCreatedUserRef.current || !email) {
      return
    }

    hasCreatedUserRef.current = true

    void createUser({ clerk_id: clerkId, email })
  }, [clerkId, createUser, email, existingUser, isLoaded, isSignedIn])

  if (!isLoaded || !isSignedIn) {
    return null
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Planty</Text>
        <Text style={styles.title}>Erfolgreich eingeloggt</Text>
        <Text style={styles.subtitle}>{email}</Text>
        <Text style={styles.syncText}>
          {existingUser === undefined ? 'Prüfe Planty-Profil…' : existingUser ? 'Planty-Profil vorhanden' : 'Planty-Profil wird angelegt…'}
        </Text>
      </View>

      <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={() => signOut()}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
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
    fontSize: 32,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 22,
  },
  syncText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 8,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: '700',
  },
})