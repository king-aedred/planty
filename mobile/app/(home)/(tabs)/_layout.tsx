import { useQuery } from 'convex/react'
import { Tabs } from 'expo-router'
import { api } from '../../../../convex/_generated/api'
import { TabBar } from '../../../components/ui/tab-bar'

// Hauptnavigation als Tabs (Stitch-Template): Pflanzen, Nachrichten, Sensoren, Einstellungen.
// Detail-Screens (Status, Pflanze hinzufügen, …) liegen im Stack darüber in app/(home)/_layout.tsx.
export default function TabsLayout() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user } = useUser()
  const clerkId = user?.id ?? ''
  const unreadCount = useQuery(api.messages.getUnreadCount, clerkId ? { clerk_id: clerkId } : 'skip')

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} dots={{ inbox: typeof unreadCount === 'number' && unreadCount > 0 }} />}
    >
      <Tabs.Screen name="plant-list" />
      <Tabs.Screen name="inbox" />
      <Tabs.Screen name="sensors" />
      <Tabs.Screen name="global-settings" />
    </Tabs>
  )
}
