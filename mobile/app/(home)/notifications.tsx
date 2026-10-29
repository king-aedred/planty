import { NotificationSettingsScreen, type NotificationSettingsValues } from '@/components/screens/notification-settings'
import { LoadingScreen } from '@/components/ui/loading-screen'
import { useChannelAdapter } from '@/hooks/use-channel-adapter'
import { useGarden } from '@/hooks/use-garden'
import { notificationValues, useUserSettings } from '@/hooks/use-user-settings'
import { useRouter } from 'expo-router'

// Benachrichtigungen: Kanäle, wie oft, wann erreichbar. Jede Änderung wird sofort gespeichert.
export default function NotificationsRoute() {
  const router = useRouter()
  const garden = useGarden()
  const settings = useUserSettings(garden.clerkId, garden.appUser)
  const channels = useChannelAdapter(garden.clerkId, garden.appUser)

  if (!garden.appUser) {
    return <LoadingScreen />
  }

  return (
    <NotificationSettingsScreen
      initial={notificationValues(garden.appUser)}
      telegramConnected={Boolean(garden.appUser.telegram_chat_id)}
      onBack={() => router.back()}
      onConnectTelegram={() => void settings.connectTelegram()}
      onDisconnectTelegram={() => void settings.disconnectTelegram()}
      onChange={(values: NotificationSettingsValues) => {
        // Push einschalten: Erlaubnis holen (und Token speichern), falls noch nicht geschehen.
        if (values.push && !notificationValues(garden.appUser).push) void channels.requestPush()
        void settings.saveNotifications(values)
      }}
      showTopics={false}
    />
  )
}
