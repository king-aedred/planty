import type { AchievementStat, Badge } from '@/components/plants/achievements'
import { useQuery } from 'convex/react'
import { useMemo } from 'react'
import type { Doc } from '../../convex/_generated/dataModel'
import { api } from '../../convex/_generated/api'
import { isoDate } from '../lib/garden-format'

const DAY = 24 * 60 * 60 * 1000
const HISTORY_DAYS = 60

// Erfolge einer Pflanze aus ihren Tagesauswertungen der letzten 60 Tage: Glücks-Serie (Tage am Stück ohne
// Warnung), Tage mit Callgreen und einfache Abzeichen. null, solange keine Daten da sind.
export function useAchievements(plant: Doc<'plants'> | null, deviceId: string | null, plantCount: number) {
  const now = Date.now()
  const summaries = useQuery(
    api.plants.getHistoricalSummaries,
    deviceId ? { device_id: deviceId, from_date: isoDate(now - HISTORY_DAYS * DAY), to_date: isoDate(now) } : 'skip',
  )

  return useMemo(() => {
    if (!plant || !deviceId || !summaries || summaries.length === 0) {
      return null
    }
    // Ein Tag ist glücklich, wenn keine seiner Auswertungen eine Warnung hatte.
    const happyByDate = new Map<string, boolean>()
    for (const summary of summaries) {
      const ok = summary.moisture_state === 'ok' && (summary.temperature_state ?? 'ok') === 'ok' && (summary.light_state ?? 'ok') === 'ok'
      happyByDate.set(summary.date, (happyByDate.get(summary.date) ?? true) && ok)
    }
    const dates = Array.from(happyByDate.keys()).sort().reverse()
    let happyDays = 0
    for (const date of dates) {
      if (!happyByDate.get(date)) break
      happyDays += 1
    }
    const ageDays = Math.max(1, Math.floor((Date.now() - plant.created_at) / DAY))
    const neverCritical = summaries.every((summary) => summary.moisture_state !== 'critical')
    const alwaysLight = summaries.length >= 7 && summaries.every((summary) => (summary.light_state ?? 'ok') === 'ok')

    const stats: AchievementStat[] = [
      { icon: 'leaf', color: '$success', value: String(happyDays), label: `${happyDays === 1 ? 'Tag' : 'Tage'} ist ${plant.name} schon glücklich` },
      { icon: 'calendar', color: '$accentText', value: String(ageDays), label: `${ageDays === 1 ? 'Tag' : 'Tage'} mit Callgreen` },
    ]
    const badges: Badge[] = [
      { id: 'first-week', icon: 'calendar', label: 'Erste Woche', earned: ageDays >= 7 },
      { id: 'never-thirsty', icon: 'water', label: 'Nie verdurstet', earned: ageDays >= 7 && neverCritical },
      { id: 'sun', icon: 'sunny', label: 'Sonnenkind', earned: alwaysLight },
      { id: 'month', icon: 'trophy', label: '30 Tage glücklich', earned: happyDays >= 30 },
      { id: 'friends', icon: 'people', label: 'Pflanzen-Clique', earned: plantCount >= 3 },
    ]
    return { stats, badges }
  }, [deviceId, plant, plantCount, summaries])
}
