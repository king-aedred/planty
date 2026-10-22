import { tokens } from './themes'

// Semantische Farben über dem Theme-Builder-Export (theme/themes.ts).
// Screens verwenden nur diese Namen oder die Builder-Schlüssel (z. B. $background, $border-color),
// nie Hex-Werte. Die bisherigen Namen ($surface, $textPrimary, $accent, …) zeigen jetzt auf die
// neuen Werte, damit bereits migrierte Screens weiterlaufen. constants/colors.ts wird in Schritt 2 ersetzt.
//
// ERGÄNZUNG zum Export: Der Export enthält weder Status- noch Charakterfarben und keinen
// gedämpften Sekundärtext (die Base-Abstufung springt von 50 % auf 93 % bzw. 50 % auf 15 %).
// Diese Werte sind hier ergänzt; Kontraste gegen Karte (dark) bzw. Hintergrund (light) stehen dabei.

const c = tokens.color

// Dark Mode nach dem Stitch-Template (Dashboard). Kontraste gegen die Karte #150F0F.
const dark = {
  background: '#161313',
  surface: '#150F0F',
  surfaceElevated: '#221F1F',
  surfaceHigh: '#2D2929',
  border: '#261C1C',
  borderStrong: '#383434',
  outline: '#928E9F',
  outlineVariant: '#484553',
  textPrimary: '#E9E1E0', // 14,7:1
  textSecondary: '#C9C4D6', // 11,2:1
  accent: '#5844C1',
  accentHover: '#6552CE',
  accentPress: '#483A89',
  accentSoft: 'rgba(88, 68, 193, 0.18)',
  // Akzent als Text/Icon (aktive Zustände). accent selbst hat als Text nur 3,0:1.
  accentText: '#C8BFFF', // 11,2:1
  // ABWEICHUNG vom Template: Text auf dem Akzent ist Weiß (7,0:1). Das Template nutzt #2D0898 (1,9:1).
  textOnAccent: c.white,
  brand: '#5844C1',
  secondary: '#CABEFF',

  // Statusfarben (Gerätezustände, Hinweise)
  success: '#75DB9D', // 11,2:1
  successSoft: 'rgba(0, 103, 60, 0.30)',
  warning: '#F5993D', // 8,6:1
  warningSoft: 'rgba(245, 153, 61, 0.15)',
  critical: '#E8635E', // 5,8:1
  criticalSoft: 'rgba(232, 99, 94, 0.20)',
  criticalText: '#FFB4AB',
  onCritical: '#690005',
  neutralSoft: 'rgba(201, 196, 214, 0.12)',

  // Charaktere
  characterHappy: '#F0BF4C',
  characterHappySoft: 'rgba(240, 191, 76, 0.15)',
  characterGrumpy: '#E87D98',
  characterGrumpySoft: 'rgba(232, 125, 152, 0.15)',
  characterNeutral: '#78BAAD',
  characterNeutralSoft: 'rgba(120, 186, 173, 0.15)',
  leaf: '#75DB9D',

  // Diagrammlinien (Status-Screen)
  chartMoisture: '#C8BFFF',
  chartTemperature: '#F5993D',
  chartLight: '#F0BF4C',
}

// Light Mode: abgeleitet aus dem Template (liefert nur Dark), gleiche Rollen, Kontraste gegen Weiß.
const light: typeof dark = {
  background: c['base-light-50'],
  surface: c.white,
  surfaceElevated: c['base-light-100'],
  surfaceHigh: c['base-light-200'],
  border: c['base-light-200'],
  borderStrong: c['base-light-300'],
  outline: '#6E6A7B',
  outlineVariant: '#C9C4D6',
  textPrimary: c['base-light-950'],
  textSecondary: 'hsla(0, 12%, 38%, 1)', // 6,8:1
  accent: c['accent-light-600'],
  accentHover: c['accent-light-500'],
  accentPress: c['accent-light-400'],
  accentSoft: 'rgba(116, 98, 203, 0.14)',
  accentText: c['accent-light-200'], // 8,2:1
  textOnAccent: c.white,
  brand: c['accent-light-600'],
  secondary: '#5D49C6',

  success: '#22774D', // 5,5:1
  successSoft: 'rgba(34, 119, 77, 0.12)',
  warning: '#B35B0F', // 4,8:1
  warningSoft: 'rgba(179, 91, 15, 0.12)',
  critical: '#B9272C', // 6,2:1
  criticalSoft: 'rgba(185, 39, 44, 0.12)',
  criticalText: '#B9272C',
  onCritical: c.white,
  neutralSoft: 'rgba(109, 85, 85, 0.10)',

  characterHappy: '#9C620D',
  characterHappySoft: 'rgba(240, 191, 76, 0.22)',
  characterGrumpy: '#B42D4F',
  characterGrumpySoft: 'rgba(232, 125, 152, 0.18)',
  characterNeutral: '#2E6B61',
  characterNeutralSoft: 'rgba(120, 186, 173, 0.20)',
  leaf: '#22774D',

  chartMoisture: c['accent-light-300'],
  chartTemperature: '#B35B0F',
  chartLight: '#9C620D',
}

export const semantic = { dark, light }
export type SemanticKey = keyof typeof dark

// Hängt die semantischen Farben an jedes generierte Theme. Unter-Themes erben das Schema ihres
// Namens; inverse Themes bekommen das umgekehrte Schema.
export function withSemantic<T extends Record<string, Record<string, string>>>(themes: T) {
  const result: Record<string, Record<string, string>> = {}
  for (const [name, theme] of Object.entries(themes)) {
    const base = name.startsWith('dark') ? 'dark' : 'light'
    const scheme = name.includes('_inverse') ? (base === 'dark' ? 'light' : 'dark') : base
    result[name] = { ...theme, ...semantic[scheme] }
  }
  return result as { [K in keyof T]: T[K] & typeof dark }
}
