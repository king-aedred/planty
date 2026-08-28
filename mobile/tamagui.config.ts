import { createFont, createTamagui, createTokens } from 'tamagui'
import { media, mediaQueryDefaultActive, shorthands, tokens as baseTokens } from '@tamagui/config/v5'
import { animationsReanimated } from '@tamagui/config/v5-reanimated'

// --- color palette -----------------------------------------------------
// Dark is the shipped default theme. Light is fully defined for a later
// phase but not activated anywhere yet (see mobile/app/_layout.tsx).

const palette = {
  dark_background: '#070A08',
  dark_surface: '#101613',
  dark_surfaceElevated: '#18211C',
  dark_border: '#232E27',
  dark_borderStrong: '#313D35',
  dark_brand: '#2F6B4F',
  dark_brandHover: '#3A8060',
  dark_accent: '#A6D639',
  dark_accentHover: '#B4E24F',
  dark_textPrimary: '#E9EEEA',
  dark_textSecondary: '#94A69B',
  dark_textOnAccent: '#0D1210',
  dark_warning: '#E0A32E',
  dark_critical: '#D14B3C',

  light_background: '#F5F7F3',
  light_surface: '#FFFFFF',
  light_surfaceElevated: '#EFF3EC',
  light_border: '#DAE2D6',
  light_borderStrong: '#BFCBB9',
  light_brand: '#2F6B4F',
  light_brandHover: '#26593F',
  light_accent: '#A6D639',
  light_accentHover: '#93C22C',
  light_textPrimary: '#101C14',
  light_textSecondary: '#4C5C4F',
  light_textOnAccent: '#0D1210',
  light_warning: '#A9701C',
  light_critical: '#B23528',
} as const

export const tokens = createTokens({
  color: palette,
  space: { 2: 2, 4: 4, 8: 8, 12: 12, 16: 16, 20: 20, 24: 24, 32: 32, 48: 48, true: 16 },
  radius: { 0: 0, 2: 2, 4: 4, 8: 8, 12: 12, true: 8 },
  size: baseTokens.size,
  zIndex: baseTokens.zIndex,
})

// --- themes --------------------------------------------------------------
// Semantic keys screens reference via `$key` (e.g. backgroundColor="$surface").
// Never reference `tokens.color.*` directly from screen code.

const dark = {
  background: tokens.color.dark_background,
  surface: tokens.color.dark_surface,
  surfaceElevated: tokens.color.dark_surfaceElevated,
  border: tokens.color.dark_border,
  borderStrong: tokens.color.dark_borderStrong,
  brand: tokens.color.dark_brand,
  brandHover: tokens.color.dark_brandHover,
  accent: tokens.color.dark_accent,
  accentHover: tokens.color.dark_accentHover,
  textPrimary: tokens.color.dark_textPrimary,
  textSecondary: tokens.color.dark_textSecondary,
  textOnAccent: tokens.color.dark_textOnAccent,
  warning: tokens.color.dark_warning,
  critical: tokens.color.dark_critical,
}

const light = {
  background: tokens.color.light_background,
  surface: tokens.color.light_surface,
  surfaceElevated: tokens.color.light_surfaceElevated,
  border: tokens.color.light_border,
  borderStrong: tokens.color.light_borderStrong,
  brand: tokens.color.light_brand,
  brandHover: tokens.color.light_brandHover,
  accent: tokens.color.light_accent,
  accentHover: tokens.color.light_accentHover,
  textPrimary: tokens.color.light_textPrimary,
  textSecondary: tokens.color.light_textSecondary,
  textOnAccent: tokens.color.light_textOnAccent,
  warning: tokens.color.light_warning,
  critical: tokens.color.light_critical,
}

export const themes = { dark, light }

// --- fonts -----------------------------------------------------------------
// heading = Antonio (display only: headlines, section labels, big numbers)
// body = Jost (everything else)
// Both are loaded at runtime via useFonts() in app/_layout.tsx, never via
// the expo-font config plugin, so no native rebuild is required.

const headingFont = createFont({
  family: 'Antonio_400Regular',
  size: { 1: 12, 2: 13, 3: 15, 4: 18, true: 18, 5: 22, 6: 26, 7: 32, 8: 40, 9: 52, 10: 64 },
  lineHeight: { 1: 14, 2: 15, 3: 17, 4: 20, true: 20, 5: 24, 6: 28, 7: 34, 8: 42, 9: 54, 10: 66 },
  weight: { 400: '400', 500: '500', 600: '600', 700: '700' },
  letterSpacing: { 1: 0, 2: 0, 3: 0, 4: 0, true: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 },
  face: {
    400: { normal: 'Antonio_400Regular' },
    500: { normal: 'Antonio_500Medium' },
    600: { normal: 'Antonio_600SemiBold' },
    700: { normal: 'Antonio_700Bold' },
  },
})

const bodyFont = createFont({
  family: 'Jost_400Regular',
  size: { 1: 12, 2: 13, 3: 14, 4: 16, true: 16, 5: 18, 6: 20, 7: 24, 8: 28 },
  lineHeight: { 1: 16, 2: 18, 3: 20, 4: 22, true: 22, 5: 25, 6: 27, 7: 31, 8: 36 },
  weight: { 400: '400', 500: '500', 600: '600', 700: '700' },
  letterSpacing: { 1: 0, 2: 0, 3: 0, 4: 0, true: 0, 5: 0, 6: 0, 7: 0, 8: 0 },
  face: {
    400: { normal: 'Jost_400Regular' },
    500: { normal: 'Jost_500Medium' },
    600: { normal: 'Jost_600SemiBold' },
    700: { normal: 'Jost_700Bold' },
  },
})

export const tamaguiConfig = createTamagui({
  animations: animationsReanimated,
  shorthands,
  media,
  themes,
  tokens,
  fonts: {
    heading: headingFont,
    body: bodyFont,
  },
  settings: {
    mediaQueryDefaultActive,
    defaultFont: 'body',
    fastSchemeChange: true,
    // Light theme is defined but not wired up to system preference yet (Phase 2).
    shouldAddPrefersColorThemes: false,
  },
})

export type AppConfig = typeof tamaguiConfig

declare module 'tamagui' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends AppConfig {}
}

export default tamaguiConfig
