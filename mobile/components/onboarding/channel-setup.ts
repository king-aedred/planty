// Schnittstelle für die Einrichtung der Benachrichtigungs-Kanäle im Onboarding.
// Vorschau: mockChannels (simuliert). Echt: Expo Notifications, Convex/Telegram-Bot (wird in Etappe 4 angebunden).

export type PushPermission = 'granted' | 'denied'

export type ChannelAdapter = {
  // System-Abfrage für Push; speichert bei Erlaubnis das Token.
  requestPush: () => Promise<PushPermission>
  // Einmaliger Code für den Telegram-Bot (/start <code>).
  createTelegramCode: () => Promise<string>
  // Telegram mit dem Bot öffnen.
  openTelegram: (code: string) => Promise<void>
  // Meldet, sobald das Konto mit Telegram verbunden ist. Gibt eine Abmelde-Funktion zurück.
  watchTelegram: (onConnected: () => void) => () => void
  // Telefonnummer speichern.
  savePhone: (phone: string) => Promise<void>
  // Testanruf; fehlt, solange Anrufe noch nicht verfügbar sind.
  startTestCall?: (phone: string) => Promise<void>
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

let telegramOpenedAt: number | null = null

export const mockChannels: ChannelAdapter = {
  requestPush: async () => {
    await wait(700)
    return 'granted'
  },
  createTelegramCode: async () => {
    await wait(400)
    return '482913'
  },
  openTelegram: async () => {
    telegramOpenedAt = Date.now()
  },
  // Simuliert: 3 s nach dem Öffnen von Telegram gilt das Konto als verbunden.
  watchTelegram: (onConnected) => {
    const timer = setInterval(() => {
      if (telegramOpenedAt !== null && Date.now() - telegramOpenedAt > 3000) {
        telegramOpenedAt = null
        onConnected()
      }
    }, 300)
    return () => clearInterval(timer)
  },
  savePhone: async () => {
    await wait(300)
  },
  startTestCall: async () => {
    await wait(3200)
  },
}
