import { api } from '../../../convex/_generated/api'
import { Redirect } from 'expo-router'
import { useMutation, useQuery } from 'convex/react'
import { useRouter } from 'expo-router'
import React, { useEffect, useRef } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

class UnauthorizedRetryBoundary extends React.Component<
  {
    children: React.ReactNode
    onUnauthorizedRetry: () => void
  },
  {
    hasError: boolean
  }
> {
  state = {
    hasError: false,
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      setTimeout(() => {
        this.props.onUnauthorizedRetry()
      }, 2000)
    }
  }

  render() {
    if (this.state.hasError) {
      return null
    }

    return this.props.children
  }
}

export default function Page() {
  const router = useRouter()

  return (
    <UnauthorizedRetryBoundary onUnauthorizedRetry={() => router.replace('/')}>
      <HomeContent />
    </UnauthorizedRetryBoundary>
  )
}

function HomeContent() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user, isLoaded, isSignedIn } = useUser()

  const clerkId = user?.id ?? ''
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? ''
  const createUser = useMutation(api.users.createUser)
  const hasCreatedUserRef = useRef(false)

  const existingUser = useQuery(
    api.users.getUserByClerkId,
    isLoaded && isSignedIn && clerkId ? { clerk_id: clerkId } : 'skip',
  )

  const plants = useQuery(
    api.plants.getAllPlantsByClerkId,
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

  if (!isLoaded || plants === undefined) {
    return <LoadingScreen />
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />
  }

  if (plants.length === 0) {
    return <Redirect href="/(home)/onboarding" />
  }

  return <Redirect href="/(home)/plant-list" />
}

function LoadingScreen() {
  return (
    <View style={styles.loadingScreen}>
      <ActivityIndicator size="large" color="#7FD38A" />
    </View>
  )
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: '#07130F',
    alignItems: 'center',
    justifyContent: 'center',
  },
})