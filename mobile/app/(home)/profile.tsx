import { ProfileScreen } from '@/components/screens/profile'
import { LoadingScreen } from '@/components/ui/loading-screen'
import { useGarden } from '@/hooks/use-garden'
import { useUserSettings } from '@/hooks/use-user-settings'
import { useRouter } from 'expo-router'

const errorText = (error: unknown, fallback: string) => {
  const clerk = error as { errors?: { longMessage?: string; message?: string }[] }
  return clerk.errors?.[0]?.longMessage ?? clerk.errors?.[0]?.message ?? (error instanceof Error ? error.message : fallback)
}

// Profil: Name (Clerk), E-Mail (nur Anzeige), Handynummer (Convex), Passwort ändern (Clerk).
export default function ProfileRoute() {
  const router = useRouter()
  const garden = useGarden()
  const settings = useUserSettings(garden.clerkId, garden.appUser)
  const user = garden.user

  if (!user || garden.appUser === undefined) {
    return <LoadingScreen />
  }

  const email = user.primaryEmailAddress?.emailAddress ?? ''

  return (
    <ProfileScreen
      name={user.username ?? ''}
      email={email}
      phone={garden.appUser?.phone_number ?? ''}
      emailEditable={false}
      onBack={() => router.back()}
      onSave={async ({ name, phone }) => {
        try {
          if (name !== (user.username ?? '')) await user.update({ username: name })
          if (phone !== (garden.appUser?.phone_number ?? '')) await settings.savePhone(phone)
          return null
        } catch (error) {
          return errorText(error, 'Speichern hat nicht geklappt.')
        }
      }}
      onChangePassword={async (current, next) => {
        try {
          await user.updatePassword({ currentPassword: current, newPassword: next })
          return null
        } catch (error) {
          return errorText(error, 'Das Passwort konnte nicht geändert werden.')
        }
      }}
    />
  )
}
