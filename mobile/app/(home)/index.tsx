import { api } from '../../../convex/_generated/api'
import { Redirect } from 'expo-router'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useRef } from 'react'

export default function Page() {
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

  if (!isLoaded || !isSignedIn) {
    return null
  }

  if (!plants) {
    return null
  }

  if (plants.length === 0) {
    return <Redirect href="/(home)/onboarding" />
  }

  return <Redirect href="/(home)/plant-list" />
}