import { TermsSheet } from '@/components/legal/terms-sheet'
import { SettingsOverview } from '@/components/screens/settings-overview'
import { TabPage } from '@/components/screens/tab-page'
import { LoadingScreen } from '@/components/ui/loading-screen'
import { useGarden } from '@/hooks/use-garden'
import { notificationValues } from '@/hooks/use-user-settings'
import Constants from 'expo-constants'
import { useQuery } from 'convex/react'
import { type Href, useRouter } from 'expo-router'
import { useState } from 'react'
import { api } from '../../../../convex/_generated/api'

// Einstellungen (Tab): Konto, Benachrichtigungen (Überblick, Details in /(home)/notifications), Rechtliches.
export default function SettingsScreen() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuth } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { signOut } = useAuth()
  const router = useRouter()
  const garden = useGarden()
  const isDev = useQuery(api.users.isDevUser, garden.clerkId ? { clerk_id: garden.clerkId } : 'skip')
  const [isTermsOpen, setIsTermsOpen] = useState(false)

  if (garden.appUser === undefined) {
    return <LoadingScreen />
  }

  const values = notificationValues(garden.appUser)
  const email = garden.user?.primaryEmailAddress?.emailAddress ?? garden.appUser?.email ?? ''

  return (
    <TabPage variant="brand" title="Einstellungen">
      <SettingsOverview
        userName={garden.user?.username ?? email.split('@')[0] ?? ''}
        email={email}
        push={values.push}
        telegramConnected={Boolean(garden.appUser?.telegram_chat_id)}
        call={values.call}
        windowText={`${values.windowFrom} bis ${values.windowTo} Uhr`}
        maxPerDayText={`${values.maxPerDay} ${values.maxPerDay === 1 ? 'Nachricht' : 'Nachrichten'} pro Tag`}
        version={Constants.expoConfig?.version ?? ''}
        onOpenProfile={() => router.push('/(home)/profile' as Href)}
        onOpenNotifications={() => router.push('/(home)/notifications' as Href)}
        onShowTerms={() => setIsTermsOpen(true)}
        onSignOut={async () => {
          await signOut()
          router.replace('/(auth)/sign-in?logout=1')
        }}
        onOpenDevTools={isDev ? () => router.push('/(home)/devmode') : undefined}
      />
      <TermsSheet visible={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
    </TabPage>
  )
}
