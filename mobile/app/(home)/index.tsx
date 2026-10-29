import { api } from '../../../convex/_generated/api'
import { Redirect, useRouter } from 'expo-router'
import { useMutation, useQuery } from 'convex/react'
import React, { useEffect, useRef } from 'react'
import { LoadingScreen } from '../../components/ui/loading-screen'

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

  if (!isLoaded) {
    return <LoadingScreen />
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/welcome" />
  }

  // Nutzer wird beim ersten Mal noch angelegt (createUser oben); bis dahin warten.
  if (plants === undefined || existingUser === undefined || existingUser === null) {
    return <LoadingScreen />
  }

  // Erste Anmeldung: Onboarding, solange es nicht erledigt ist und noch keine Pflanze existiert
  // (ältere Konten ohne Feld onboarding_done, aber mit Pflanzen, gelten als fertig).
  if (!existingUser.onboarding_done && plants.length === 0) {
    return <Redirect href="/(home)/onboarding" />
  }

  return <Redirect href="/(home)/(tabs)/plant-list" />
}
