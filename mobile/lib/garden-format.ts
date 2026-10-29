// Formatierung für die App-Screens (deutsch, lokale Zeit).

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const pad = (value: number) => String(value).padStart(2, '0')

export function clockTime(ms: number) {
  const date = new Date(ms)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const startOfDay = (ms: number) => {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

// „Heute“, „Gestern“ oder „Mo., 26.10.“.
export function dayLabel(ms: number, now = Date.now()) {
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY)
  if (days === 0) return 'Heute'
  if (days === 1) return 'Gestern'
  const date = new Date(ms)
  const weekday = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'][date.getDay()]
  return `${weekday}, ${pad(date.getDate())}.${pad(date.getMonth() + 1)}.`
}

// „Heute, 11:58“
export function dayAndTime(ms: number, now = Date.now()) {
  return `${dayLabel(ms, now)}, ${clockTime(ms)}`
}

// „gerade eben“, „vor 12 Min.“, „vor 3 Std.“, „vor 2 Tagen“.
export function relativeTime(ms: number, now = Date.now()) {
  const diff = Math.max(0, now - ms)
  if (diff < MINUTE) return 'gerade eben'
  if (diff < HOUR) return `vor ${Math.floor(diff / MINUTE)} Min.`
  if (diff < DAY) return `vor ${Math.floor(diff / HOUR)} Std.`
  const days = Math.floor(diff / DAY)
  return days === 1 ? 'vor 1 Tag' : `vor ${days} Tagen`
}

// Lokales Datum als YYYY-MM-DD (für Abfragen nach Tagesauswertungen).
export function isoDate(ms: number) {
  const date = new Date(ms)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
