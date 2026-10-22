import { createFont, createTamagui, createTokens } from 'tamagui'
import { media, mediaQueryDefaultActive, shorthands, tokens as baseTokens } from '@tamagui/config/v5'
import { animationsReanimated } from '@tamagui/config/v5-reanimated'
import { themes as builderThemes, tokens as themeTokens } from './theme/themes'
import { withSemantic } from './theme/semantic'

// --- Farben ------------------------------------------------------------------
// Einzige Farbquelle: Theme-Builder-Export (theme/themes.ts, Preset Violet) plus semantische
// Schicht (theme/semantic.ts). Dark und Light folgen der Systemeinstellung (app/_layout.tsx).
// Screens nutzen Theme-Schlüssel ($background, $surface, $textPrimary, $accent, $border-color, …),
// nie Hex-Werte und nie tokens.color direkt.

export const tokens = createTokens({
  color: themeTokens.color,
  space: { 2: 2, 4: 4, 6: 6, 8: 8, 12: 12, 16: 16, 20: 20, 24: 24, 32: 32, 48: 48 },
  // 16: Karten, 999: Pillen (Badges).
  // Tamagui 3: Der Schlüssel "true" ist in Token-Skalen nicht mehr erlaubt.
  radius: { 0: 0, 2: 2, 4: 4, 8: 8, 12: 12, 16: 16, 999: 999 },
  size: baseTokens.size,
  zIndex: baseTokens.zIndex,
})

export const themes = withSemantic(builderThemes)

// --- fonts -----------------------------------------------------------------
// Aus dem Stitch-Template: heading = Bebas Neue (nur Überschriften, Großbuchstaben, eine Stärke),
// body = Space Grotesk (alles andere). Geladen per useFonts() in app/_layout.tsx (kein nativer Neubau).

const headingFont = createFont({
  family: 'BebasNeue_400Regular',
  size: { 1: 14, 2: 16, 3: 20, 4: 24, 5: 28, 6: 32, 7: 36, 8: 42, 9: 56 },
  lineHeight: { 1: 16, 2: 18, 3: 22, 4: 26, 5: 30, 6: 34, 7: 38, 8: 44, 9: 56 },
  weight: { 400: '400' },
  letterSpacing: { 1: 0.4, 2: 0.4, 3: 0.4, 4: 0.5, 5: 0.6, 6: 0.8, 7: 1, 8: 1.2, 9: 2 },
  face: {
    400: { normal: 'BebasNeue_400Regular' },
  },
})

const bodyFont = createFont({
  family: 'SpaceGrotesk_400Regular',
  size: { 1: 11, 2: 12, 3: 13, 4: 14, 5: 15, 6: 17, 7: 20, 8: 24 },
  lineHeight: { 1: 14, 2: 16, 3: 18, 4: 20, 5: 22, 6: 24, 7: 28, 8: 32 },
  weight: { 400: '400', 500: '500', 600: '600', 700: '700' },
  letterSpacing: { 1: 0.4, 2: 0.4, 3: 0, 4: 0.3, 5: 0, 6: 0, 7: 0, 8: 0 },
  face: {
    400: { normal: 'SpaceGrotesk_400Regular' },
    500: { normal: 'SpaceGrotesk_500Medium' },
    600: { normal: 'SpaceGrotesk_600SemiBold' },
    700: { normal: 'SpaceGrotesk_700Bold' },
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
    // Dark/Light nach Systemeinstellung.
    shouldAddPrefersColorThemes: true,
  },
})

export type AppConfig = typeof tamaguiConfig

declare module 'tamagui' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends AppConfig {}
}

export default tamaguiConfig
