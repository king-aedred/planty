import { InboxList } from '@/components/screens/inbox-list'
import { TabPage } from '@/components/screens/tab-page'
import { LoadingScreen } from '@/components/ui/loading-screen'
import { useGarden } from '@/hooks/use-garden'
import { useMutation } from 'convex/react'
import { useRouter } from 'expo-router'
import type { Id } from '../../../../convex/_generated/dataModel'
import { api } from '../../../../convex/_generated/api'

// Nachrichten (Tab): alle Nachrichten der Pflanzen, nach Tagen gruppiert. Antippen markiert als gelesen
// und öffnet die Pflanze bzw. den Sensor.
export default function InboxScreen() {
  const router = useRouter()
  const garden = useGarden()
  const markAsRead = useMutation(api.messages.markAsRead)

  if (garden.isLoading || garden.messages === undefined) {
    return <LoadingScreen />
  }

  const unread = garden.inboxItems.filter((item) => item.unread).length

  return (
    <TabPage variant="brand" title="Nachrichten" subtitle={unread > 0 ? `${unread} ungelesen` : undefined}>
      <InboxList
        items={garden.inboxItems}
        onOpen={(item) => {
          const message = garden.messages?.find((entry) => String(entry._id) === item.id)
          if (!message) return
          if (!message.read) void markAsRead({ message_id: message._id as Id<'messages'> })
          const plant = garden.plantByDevice.get(message.device_id)
          if (message.type === 'system_message' || !plant) {
            router.push({ pathname: '/(home)/sensor', params: { device_id: message.device_id } })
          } else {
            router.push({ pathname: '/(home)/status', params: { plant_id: String(plant._id) } })
          }
        }}
      />
    </TabPage>
  )
}
