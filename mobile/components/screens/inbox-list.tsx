import { PlantAvatar, type PlantMood, type PlantStatusTone } from '@/components/plants/plant-avatar'
import { Card } from '@/components/ui/card'
import { SectionLabel } from '@/components/ui/section-label'
import { Ionicons } from '@expo/vector-icons'
import { Text, useTheme, XStack, YStack } from 'tamagui'

export type InboxItem = {
  id: string
  // Gruppe, z. B. „Heute“, „Gestern“, „Mo., 26.10.“.
  day: string
  time: string
  title: string
  text: string
  unread: boolean
  // null = Hinweis von Callgreen (z. B. Akku), sonst Avatar der Pflanze.
  avatar: { mood: PlantMood; tone: PlantStatusTone } | null
}

// Nachrichten (Tab), nach Tagen gruppiert; ungelesene mit hellem Text und Punkt.
export function InboxList({ items, onOpen }: { items: InboxItem[]; onOpen: (item: InboxItem) => void }) {
  const theme = useTheme()
  const days = Array.from(new Set(items.map((item) => item.day)))

  if (items.length === 0) {
    return (
      <YStack alignItems="center" gap="$8" paddingVertical="$32">
        <Ionicons name="chatbubbles-outline" size={32} color={theme.textSecondary?.val} />
        <Text fontFamily="$body" fontSize={14} color="$textSecondary" textAlign="center">
          Noch keine Nachrichten. Sobald deine Pflanzen etwas zu sagen haben, steht es hier.
        </Text>
      </YStack>
    )
  }

  return (
    <YStack gap="$16">
      {days.map((day) => (
        <YStack key={day} gap="$8">
          <SectionLabel>{day}</SectionLabel>
          <Card dense>
            {items
              .filter((item) => item.day === day)
              .map((item, index) => (
                <XStack
                  key={item.id}
                  role="button"
                  onPress={() => onOpen(item)}
                  gap="$12"
                  padding="$12"
                  borderTopWidth={index > 0 ? 1 : 0}
                  borderColor="$border"
                  alignItems="flex-start"
                  backgroundColor="transparent press:$surfaceElevated"
                >
                  {item.avatar ? (
                    <PlantAvatar mood={item.avatar.mood} status={item.avatar.tone} size={40} />
                  ) : (
                    <YStack width={40} height={40} borderRadius="$999" backgroundColor="$warningSoft" alignItems="center" justifyContent="center">
                      <Ionicons name="radio-outline" size={20} color={theme.warning?.val} />
                    </YStack>
                  )}
                  <YStack flex={1} gap="$2">
                    <XStack justifyContent="space-between" alignItems="baseline">
                      <Text fontFamily="$body" fontWeight="700" fontSize={14} color="$textPrimary">
                        {item.title}
                      </Text>
                      <Text fontFamily="$body" fontSize={11} color="$textSecondary">
                        {item.time}
                      </Text>
                    </XStack>
                    <Text fontFamily="$body" fontSize={14} lineHeight="$4" color={item.unread ? '$textPrimary' : '$textSecondary'}>
                      {item.text}
                    </Text>
                  </YStack>
                  {item.unread ? <YStack width={8} height={8} marginTop={6} borderRadius="$999" backgroundColor="$accentText" /> : null}
                </XStack>
              ))}
          </Card>
        </YStack>
      ))}
    </YStack>
  )
}
