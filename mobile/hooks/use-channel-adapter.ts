import type { ChannelAdapter } from '@/components/onboarding/channel-setup'
import { useConvex, useMutation } from 'convex/react'
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { useMemo } from 'react'
import { Linking, Platform } from 'react-native'
import type { Doc } from '../../convex/_generated/dataModel'
import { api } from '../../convex/_generated/api'
import { useUserSettings } from './use-user-settings'

const TELEGRAM_BOT = 'https://t.me/planty247_bot'

// Echte Technik hinter der Kanal-Einrichtung im Onboarding: Push-Erlaubnis und Token, Telegram-Code und
// Verbindung (live aus Convex), Telefonnummer. Testanrufe gibt es noch nicht.
export function useChannelAdapter(clerkId: string, user: Doc<'users'> | null | undefined): ChannelAdapter {
  const convex = useConvex()
  const updatePushToken = useMutation(api.users.updatePushToken)
  const generateTelegramConnectCode = useMutation(api.users.generateTelegramConnectCode)
  const settings = useUserSettings(clerkId, user)

  return useMemo<ChannelAdapter>(
    () => ({
      requestPush: async () => {
        if (Platform.OS === 'web') return 'denied'
        const permission = await Notifications.requestPermissionsAsync()
        if (!permission.granted) return 'denied'
        const projectId = Constants.expoConfig?.extra?.eas?.projectId
        if (projectId && clerkId) {
          try {
            const token = await Notifications.getExpoPushTokenAsync({ projectId })
            if (token.data) await updatePushToken({ clerk_id: clerkId, token: token.data })
          } catch (error) {
            console.error('[push] Token konnte nicht registriert werden', error)
          }
        }
        return 'granted'
      },
      createTelegramCode: () => generateTelegramConnectCode(),
      openTelegram: async (code) => {
        await Linking.openURL(`${TELEGRAM_BOT}?start=${code}`)
      },
      watchTelegram: (onConnected) => {
        const watch = convex.watchQuery(api.users.getUserByClerkId, { clerk_id: clerkId })
        return watch.onUpdate(() => {
          if (watch.localQueryResult()?.telegram_chat_id) onConnected()
        })
      },
      savePhone: (phone) => settings.savePhone(phone),
    }),
    [clerkId, convex, generateTelegramConnectCode, settings, updatePushToken],
  )
}
