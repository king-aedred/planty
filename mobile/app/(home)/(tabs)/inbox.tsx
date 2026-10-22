import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useMutation, useQuery } from 'convex/react'
import { useMemo } from 'react'
import { Text, XStack, YStack } from 'tamagui'
import { Badge, type BadgeTone } from '../../../components/ui/badge'
import { Card } from '../../../components/ui/card'
import { EmptyState } from '../../../components/ui/empty-state'
import { Screen } from '../../../components/ui/screen'
import { ScreenHeader } from '../../../components/ui/screen-header'
import { TAB_BAR_SPACE } from '../../../components/ui/tab-bar'

type Message = {
  _id: Id<'messages'>
  plant_name: string
  text: string
  state: 'ok' | 'warning' | 'critical'
  read: boolean
  created_at: number
}

export default function InboxScreen() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser } = require('@clerk/expo') as typeof import('@clerk/expo')
  const { user } = useUser()
  const markAsRead = useMutation(api.messages.markAsRead)

  const clerkId = user?.id ?? ''
  const messages = useQuery(api.messages.getMessagesByClerkId, clerkId ? { clerk_id: clerkId } : 'skip') as
    | Message[]
    | undefined

  const formattedMessages = useMemo(() => messages ?? [], [messages])
  const hasMessages = formattedMessages.length > 0

  const handleMarkAsRead = (messageId: string) => {
    void markAsRead({ message_id: messageId as Id<'messages'> })
  }

  return (
    <Screen scroll>
      <ScreenHeader eyebrow="Inbox" title="Nachrichten" withMenu={false} />

      {messages === undefined ? null : hasMessages ? (
        <YStack gap="$8">
          {formattedMessages.map((message) => (
            <YStack
              key={message._id}
              role="button"
              onPress={() => handleMarkAsRead(message._id)}
              backgroundColor="$surface press:$surfaceElevated"
              borderWidth={1}
              borderColor={message.read ? '$border' : '$borderStrong'}
              borderRadius="$16"
              padding="$16"
              gap="$8"
            >
              <XStack alignItems="center" gap="$8">
                {!message.read ? <YStack width={8} height={8} borderRadius="$999" backgroundColor="$accent" /> : null}
                <Text flex={1} fontFamily="$body" fontWeight={message.read ? '600' : '700'} fontSize={16} color="$textPrimary" numberOfLines={1}>
                  {message.plant_name}
                </Text>
                <Text fontFamily="$body" fontSize={12} color="$textSecondary">
                  {formatMessageTime(message.created_at)}
                </Text>
              </XStack>
              <Badge tone={MESSAGE_TONES[message.state].tone} label={MESSAGE_TONES[message.state].label} />
              <Text fontFamily="$body" fontSize={15} lineHeight="$5" color={message.read ? '$textSecondary' : '$textPrimary'}>
                {message.text}
              </Text>
            </YStack>
          ))}
        </YStack>
      ) : (
        <Card>
          <EmptyState
            icon="mail-outline"
            title="Noch keine Nachrichten"
            text="Sobald deine Pflanze ihre erste Messung sendet, hörst du von ihr."
          />
        </Card>
      )}
      <YStack height={TAB_BAR_SPACE} />
    </Screen>
  )
}

const MESSAGE_TONES: Record<Message['state'], { tone: BadgeTone; label: string }> = {
  ok: { tone: 'success', label: 'Alles gut' },
  warning: { tone: 'warning', label: 'Achtung' },
  critical: { tone: 'critical', label: 'Kritisch' },
}

function formatMessageTime(timestamp: number) {
  const diffInSeconds = Math.floor((Date.now() - timestamp) / 1000)

  if (diffInSeconds < 60) {
    return 'vor wenigen Sekunden'
  }

  if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60)
    return `vor ${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}`
  }

  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600)
    return `vor ${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}`
  }

  if (diffInSeconds < 86400 * 7) {
    const days = Math.floor(diffInSeconds / 86400)
    return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`
  }

  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}
