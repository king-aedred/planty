import { useCallback, useEffect, useRef, useState } from 'react'
import { useConvex } from 'convex/react'
import { api } from '../../convex/_generated/api'

// Befehle an den Sensor (Backend: convex/device_commands.ts, Vertrag Firmware v7 Abschnitt 6).
// Ablauf: Befehl absetzen (requestMeasureNow, requestSetWifi, …), dann getCommandStatus abfragen,
// bis der Befehl ok, failed oder expired ist. Im Akkubetrieb holt der Sensor Befehle erst beim
// nächsten Messzyklus ab; ein Timeout heißt daher nur "noch nicht erledigt", nicht "fehlgeschlagen".
// Achtung: Parameter (z. B. WLAN-Passwort) nie loggen.

export type CommandOutcome =
  | { kind: 'ok'; detail: string | null }
  | { kind: 'failed'; detail: string | null; message: string }
  | { kind: 'expired'; detail: string | null; message: string }
  // Noch pending/delivered nach Ablauf der Wartezeit. Der Befehl bleibt im Backend offen.
  | { kind: 'waiting'; commandId: string }
  | { kind: 'aborted' }
  | { kind: 'error'; message: string }

type CommandStart = () => Promise<{ command_id: string; expires_at: number }>

const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000
const DEFAULT_INTERVAL_MS = 2000

const GENERIC_FAILURE = 'Das hat leider nicht geklappt. Versuch es später noch einmal.'

// Texte für das Feld detail. Unbekannte Werte bekommen den allgemeinen Text, nie den Rohwert.
const DETAIL_MESSAGES: Record<string, string> = {
  // Firmware
  auth_failed: 'Das WLAN-Passwort stimmt nicht. Prüfe es und versuch es erneut.',
  not_found: 'Das Netzwerk wurde nicht gefunden. Prüfe den Namen und denk dran: Callgreen funkt nur auf 2,4 GHz.',
  timeout: 'Dein Sensor hat nicht rechtzeitig geantwortet. Versuch es gleich noch einmal.',
  no_backend: 'Dein Sensor ist im WLAN, erreicht Callgreen aber nicht. Hat dein WLAN Internetzugang?',
  invalid_params: 'Die Angaben waren unvollständig oder ungültig. Prüf sie und versuch es erneut.',
  unsupported: 'Das kann dein Sensor mit seiner aktuellen Software noch nicht.',
  not_supported: 'Das kann dein Sensor mit seiner aktuellen Software noch nicht.',
  // Backend
  replaced: 'Du hast inzwischen einen neueren Auftrag geschickt. Der ältere wurde verworfen.',
  expired: 'Dein Sensor hat den Auftrag nicht rechtzeitig abgeholt. Versuch es erneut, wenn er online ist.',
  sensor_removed: 'Der Sensor wurde aus deinem Konto entfernt.',
  factory_reset: 'Der Sensor wurde auf Werkseinstellungen zurückgesetzt.',
}

export function describeCommandDetail(detail: string | null | undefined): string {
  return (detail && DETAIL_MESSAGES[detail]) || GENERIC_FAILURE
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
  })

export function useDeviceCommand() {
  const convex = useConvex()
  const controller = useRef<AbortController | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  const cancel = useCallback(() => {
    controller.current?.abort()
    controller.current = null
  }, [])

  // Abbrechen, wenn der Screen verlassen wird.
  useEffect(() => cancel, [cancel])

  const run = useCallback(
    async (
      start: CommandStart,
      options: { timeoutMs?: number; intervalMs?: number } = {},
    ): Promise<CommandOutcome> => {
      cancel()
      const abort = new AbortController()
      controller.current = abort
      setIsRunning(true)

      try {
        let commandId: string
        try {
          commandId = (await start()).command_id
        } catch {
          return { kind: 'error', message: 'Der Auftrag konnte nicht gesendet werden. Prüfe deine Verbindung.' }
        }

        const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
        while (!abort.signal.aborted) {
          try {
            const status = await convex.query(api.device_commands.getCommandStatus, { command_id: commandId })
            if (status?.status === 'ok') return { kind: 'ok', detail: status.detail }
            if (status?.status === 'failed') {
              return { kind: 'failed', detail: status.detail, message: describeCommandDetail(status.detail) }
            }
            if (status?.status === 'expired') {
              return { kind: 'expired', detail: status.detail, message: describeCommandDetail(status.detail ?? 'expired') }
            }
          } catch {
            // Vorübergehender Netzfehler: weiter abfragen bis zum Timeout.
          }
          if (Date.now() >= deadline) return { kind: 'waiting', commandId }
          await sleep(options.intervalMs ?? DEFAULT_INTERVAL_MS, abort.signal)
        }
        return { kind: 'aborted' }
      } finally {
        if (controller.current === abort) controller.current = null
        setIsRunning(false)
      }
    },
    [cancel, convex],
  )

  return { run, cancel, isRunning }
}
