import { useMemo } from 'react'
import { useTheme } from 'tamagui'

// Aufgelöste Theme-Farben als Strings für Stellen, die (noch) mit StyleSheet arbeiten,
// z. B. die Dev-Tools. Neue Screens nutzen direkt Tamagui-Tokens ($textPrimary …).
export function usePalette() {
  const theme = useTheme()
  const get = (key: string, fallback: string) =>
    (theme as Record<string, { val?: string } | undefined>)[key]?.val ?? fallback

  const background = get('background', '#161313')
  const surface = get('surface', '#150F0F')
  const surfaceElevated = get('surfaceElevated', '#221F1F')
  const border = get('border', '#261C1C')
  const borderStrong = get('borderStrong', '#383434')
  const textPrimary = get('textPrimary', '#E9E1E0')
  const textSecondary = get('textSecondary', '#C9C4D6')
  const accent = get('accent', '#5844C1')
  const accentSoft = get('accentSoft', 'rgba(88, 68, 193, 0.18)')
  const accentText = get('accentText', '#C8BFFF')
  const textOnAccent = get('textOnAccent', '#FFFFFF')
  const success = get('success', '#75DB9D')
  const successSoft = get('successSoft', 'rgba(0, 103, 60, 0.30)')
  const warning = get('warning', '#F5993D')
  const warningSoft = get('warningSoft', 'rgba(245, 153, 61, 0.15)')
  const critical = get('critical', '#E8635E')
  const criticalSoft = get('criticalSoft', 'rgba(232, 99, 94, 0.20)')
  const criticalText = get('criticalText', '#FFB4AB')

  return useMemo(
    () => ({
      background,
      surface,
      surfaceElevated,
      border,
      borderStrong,
      textPrimary,
      textSecondary,
      accent,
      accentSoft,
      accentText,
      textOnAccent,
      success,
      successSoft,
      warning,
      warningSoft,
      critical,
      criticalSoft,
      criticalText,
      overlay: 'rgba(0, 0, 0, 0.55)',
    }),
    [background, surface, surfaceElevated, border, borderStrong, textPrimary, textSecondary, accent, accentSoft, accentText, textOnAccent, success, successSoft, warning, warningSoft, critical, criticalSoft, criticalText],
  )
}

export type Palette = ReturnType<typeof usePalette>
