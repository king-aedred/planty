import { Colors } from '@/constants/colors'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { useMutation, useQuery } from 'convex/react'
import { useRouter } from 'expo-router'
import { useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const colors = Colors.dark

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
  const router = useRouter()
  const markAsRead = useMutation(api.messages.markAsRead)

  const clerkId = user?.id ?? ''
  const messages = useQuery(api.messages.getMessagesByClerkId, clerkId ? { clerk_id: clerkId } : 'skip') as
    | Message[]
    | undefined

  const formattedMessages = useMemo(() => messages ?? [], [messages])
  const hasMessages = formattedMessages.length > 0

  const handleMarkAsRead = (messageId: string) => {
    void markAsRead({ message_id: messageId })
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <View style={styles.headerRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            >
              <Text style={styles.backButtonText}>← Zurück</Text>
            </Pressable>

            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>Inbox</Text>
              <Text style={styles.title}>Nachrichten</Text>
            </View>
          </View>

          {hasMessages ? (
            <View style={styles.list}>
              {formattedMessages.map((message) => (
                <Pressable
                  key={message._id}
                  accessibilityRole="button"
                  onPress={() => handleMarkAsRead(message._id)}
                  style={({ pressed }) => [
                    styles.card,
                    styles[message.state],
                    !message.read && styles.unreadCard,
                    pressed && styles.cardPressed,
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.titleRow}>
                      {!message.read ? <View style={styles.unreadDot} /> : null}
                      <Text style={[styles.cardTitle, !message.read && styles.cardTitleUnread]} numberOfLines={1}>
                        {message.plant_name}
                      </Text>
                    </View>
                    <Text style={styles.timeText}>{formatMessageTime(message.created_at)}</Text>
                  </View>

                  <Text style={[styles.messageText, !message.read && styles.messageTextUnread]}>{message.text}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>Noch keine Nachrichten</Text>
              <Text style={styles.emptyStateText}>
                Sobald deine Pflanze ihre erste Messung sendet, hörst du von ihr! 🌱
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    padding: 20,
    gap: 20,
    backgroundColor: colors.background,
  },
  headerRow: {
    gap: 16,
    paddingTop: 4,
  },
  backButton: {
    alignSelf: 'flex-start',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backButtonPressed: {
    opacity: 0.9,
  },
  backButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  headerText: {
    gap: 8,
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
    lineHeight: 36,
  },
  list: {
    gap: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 6,
    padding: 16,
    gap: 12,
  },
  cardPressed: {
    opacity: 0.9,
  },
  unreadCard: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  ok: {
    borderLeftColor: colors.success,
  },
  warning: {
    borderLeftColor: colors.warning,
  },
  critical: {
    borderLeftColor: colors.critical,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    flexShrink: 1,
  },
  cardTitleUnread: {
    fontWeight: '800',
  },
  timeText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'right',
  },
  messageText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  messageTextUnread: {
    color: colors.text,
    fontWeight: '600',
  },
  emptyState: {
    marginTop: 12,
    padding: 20,
    borderRadius: 24,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
    gap: 10,
    alignItems: 'center',
  },
  emptyStateTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  emptyStateText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
})