import { Colors } from '@/constants/colors'
import { type Href, Link, useRouter } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

const colors = Colors.dark

export default function Page() {
  return <SignInContent />
}

function SignInContent() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useSignIn } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { signIn, errors, fetchStatus } = useSignIn()
  const router = useRouter()

  const [emailAddress, setEmailAddress] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [errorMessage, setErrorMessage] = React.useState('')

  if (!signIn) {
    return null
  }

  const navigateToHome = (url: string) => {
    if (url.startsWith('http')) {
      if (typeof window !== 'undefined') {
        window.location.href = url
      }
      return
    }

    router.replace(url as Href)
  }

  const handleSubmit = async () => {
    setErrorMessage('')

    try {
      const { error } = await signIn.password({
        identifier: emailAddress,
        password,
      })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      if (signIn.status !== 'complete') {
        setErrorMessage('Sign-in konnte nicht abgeschlossen werden.')
        return
      }

      const { error: finalizeError } = await signIn.finalize()
      if (finalizeError) {
        setErrorMessage(finalizeError.message)
        return
      }

      navigateToHome('/(home)')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Sign-in fehlgeschlagen.')
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Planty</Text>
        <Text style={styles.title}>Willkommen zurück</Text>
        <Text style={styles.subtitle}>Melde dich mit deiner E-Mail-Adresse und deinem Passwort an.</Text>

        <Text style={styles.label}>E-Mail-Adresse</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          value={emailAddress}
          placeholder="name@beispiel.de"
          placeholderTextColor={colors.muted}
          onChangeText={setEmailAddress}
          keyboardType="email-address"
        />

        <Text style={styles.label}>Passwort</Text>
        <TextInput
          style={styles.input}
          value={password}
          placeholder="Dein Passwort"
          placeholderTextColor={colors.muted}
          secureTextEntry
          onChangeText={setPassword}
        />

        {errors.fields.identifier ? <Text style={styles.error}>{errors.fields.identifier.message}</Text> : null}
        {errors.fields.password ? <Text style={styles.error}>{errors.fields.password.message}</Text> : null}

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            (!emailAddress || !password || fetchStatus === 'fetching') && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
          onPress={handleSubmit}
          disabled={!emailAddress || !password || fetchStatus === 'fetching'}
        >
          <Text style={styles.buttonText}>Sign in</Text>
        </Pressable>

        <View style={styles.linkRow}>
          <Text style={styles.linkPrompt}>Noch kein Konto?</Text>
          <Link href="/(auth)/sign-up">
            <Text style={styles.link}>Sign up</Text>
          </Link>
        </View>
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
    marginBottom: 8,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: '700',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  linkPrompt: {
    color: colors.muted,
    fontSize: 14,
  },
  link: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    marginTop: -6,
  },
})
