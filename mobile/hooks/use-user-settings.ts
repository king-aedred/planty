import type { NotificationSettingsValues } from '@/components/screens/notification-settings'
import { useMutation } from 'convex/react'
import { useCallback } from 'react'
import { Linking } from 'react-native'
import type { Doc } from '../../convex/_generated/dataModel'
import { api } from '../../convex/_generated/api'

type Channel = 'push' | 'telegram' | 'call'
type Rules = { ok: Channel[]; warning: Channel[]; critical: Channel[] }

const TELEGRAM_BOT = 'https://t.me/planty247_bot'
const DEFAULT_WINDOW = { from: 8, to: 21 }

const has = (rules: Rules | undefined, channel: Channel) => Boolean(rules?.warning.includes(channel) || rules?.critical.includes(channel))

// Kanal für Warnungen und kritische Zustände an- bzw. abschalten; „ok“ bleibt, wie es ist.
function withChannel(rules: Rules | undefined, channel: Channel, on: boolean): Rules {
  const base: Rules = rules ?? { ok: [], warning: [], critical: [] }
  const apply = (list: Channel[]) => (on ? Array.from(new Set([...list, channel])) : list.filter((entry) => entry !== channel))
  return { ok: base.ok, warning: apply(base.warning), critical: apply(base.critical) }
}

export function notificationValues(user: Doc<'users'> | null | undefined): NotificationSettingsValues {
  return {
    push: has(user?.notification_rules, 'push'),
    call: has(user?.notification_rules, 'call'),
    maxPerDay: user?.max_notifications_per_day ?? 1,
    windowFrom: user?.contact_window_start ?? DEFAULT_WINDOW.from,
    windowTo: user?.contact_window_end ?? DEFAULT_WINDOW.to,
  }
}

// Nutzer-Einstellungen speichern. updateUserSettings überschreibt alle Felder, deshalb immer den
// vollständigen aktuellen Stand mitschicken und nur das Geänderte ersetzen.
export function useUserSettings(clerkId: string, user: Doc<'users'> | null | undefined) {
  const updateUserSettings = useMutation(api.users.updateUserSettings)
  const generateTelegramConnectCode = useMutation(api.users.generateTelegramConnectCode)
  const disconnectTelegram = useMutation(api.users.disconnectTelegram)

  const save = useCallback(
    async (patch: { rules?: Rules; window?: { from: number; to: number }; maxPerDay?: number; phone?: string }) => {
      if (!clerkId || !user) return
      await updateUserSettings({
        clerk_id: clerkId,
        settings: {
          notification_rules: patch.rules ?? user.notification_rules,
          contact_window_start: patch.window?.from ?? user.contact_window_start,
          contact_window_end: patch.window?.to ?? user.contact_window_end,
          measure_time: user.measure_time,
          phone_number: patch.phone ?? user.phone_number,
          max_notifications_per_day: patch.maxPerDay ?? user.max_notifications_per_day,
        },
      })
    },
    [clerkId, updateUserSettings, user],
  )

  const saveNotifications = useCallback(
    (values: NotificationSettingsValues) =>
      save({
        rules: withChannel(withChannel(user?.notification_rules, 'push', values.push), 'call', values.call),
        window: { from: values.windowFrom, to: values.windowTo },
        maxPerDay: values.maxPerDay,
      }),
    [save, user],
  )

  const savePhone = useCallback((phone: string) => save({ phone }), [save])

  const connectTelegram = useCallback(async () => {
    const code = await generateTelegramConnectCode()
    await Linking.openURL(`${TELEGRAM_BOT}?start=${code}`)
    return code
  }, [generateTelegramConnectCode])

  return { saveNotifications, savePhone, connectTelegram, disconnectTelegram: () => disconnectTelegram() }
}
