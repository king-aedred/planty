import {
  createThemes,
  fromShades,
  levels,
  ramp,
  raise,
  type GetThemeContext,
  type ThemeDefinitionContext,
} from '@tamagui/themes/builder'

export const tokens: { color: Record<string, string> } = {
  color: {
  "white": "#ffffff",
  "black": "#000000",
  "base-light-50": "hsla(0, 15%, 99%, 1)",
  "base-light-100": "hsla(0, 15%, 93%, 1)",
  "base-light-200": "hsla(0, 15%, 87%, 1)",
  "base-light-300": "hsla(0, 15%, 81%, 1)",
  "base-light-400": "hsla(0, 15%, 75%, 1)",
  "base-light-500": "hsla(0, 15%, 68%, 1)",
  "base-light-600": "hsla(0, 15%, 62%, 1)",
  "base-light-700": "hsla(0, 15%, 56%, 1)",
  "base-light-800": "hsla(0, 15%, 50%, 1)",
  "base-light-900": "hsla(0, 15%, 15%, 1)",
  "base-light-950": "hsla(0, 15%, 1%, 1)",
  "base-dark-50": "hsla(0, 15%, 99%, 1)",
  "base-dark-100": "hsla(0, 15%, 93%, 1)",
  "base-dark-200": "hsla(0, 15%, 50%, 1)",
  "base-dark-300": "hsla(0, 15%, 44%, 1)",
  "base-dark-400": "hsla(0, 15%, 38%, 1)",
  "base-dark-500": "hsla(0, 15%, 32%, 1)",
  "base-dark-600": "hsla(0, 15%, 26%, 1)",
  "base-dark-700": "hsla(0, 15%, 19%, 1)",
  "base-dark-800": "hsla(0, 15%, 13%, 1)",
  "base-dark-900": "hsla(0, 15%, 7%, 1)",
  "base-dark-950": "hsla(0, 15%, 1%, 1)",
  "accent-light-50": "hsla(250, 50%, 40%, 1)",
  "accent-light-100": "hsla(250, 50%, 43%, 1)",
  "accent-light-200": "hsla(250, 50%, 46%, 1)",
  "accent-light-300": "hsla(250, 50%, 49%, 1)",
  "accent-light-400": "hsla(250, 50%, 53%, 1)",
  "accent-light-500": "hsla(250, 50%, 56%, 1)",
  "accent-light-600": "hsla(250, 50%, 59%, 1)",
  "accent-light-700": "hsla(250, 50%, 62%, 1)",
  "accent-light-800": "hsla(250, 50%, 65%, 1)",
  "accent-light-900": "hsla(250, 50%, 95%, 1)",
  "accent-light-950": "hsla(250, 50%, 95%, 1)",
  "accent-dark-50": "hsla(250, 50%, 95%, 1)",
  "accent-dark-100": "hsla(250, 50%, 90%, 1)",
  "accent-dark-200": "hsla(250, 50%, 60%, 1)",
  "accent-dark-300": "hsla(250, 50%, 57%, 1)",
  "accent-dark-400": "hsla(250, 50%, 54%, 1)",
  "accent-dark-500": "hsla(250, 50%, 51%, 1)",
  "accent-dark-600": "hsla(250, 50%, 48%, 1)",
  "accent-dark-700": "hsla(250, 50%, 44%, 1)",
  "accent-dark-800": "hsla(250, 50%, 41%, 1)",
  "accent-dark-900": "hsla(250, 50%, 38%, 1)",
  "accent-dark-950": "hsla(250, 50%, 35%, 1)"
},
}

const light = {
  "background": 50,
  "background-hover": 100,
  "background-press": 50,
  "background-focus": 100,
  "background-active": "white",
  "border-color": 200,
  "border-color-hover": 300,
  "border-color-press": 200,
  "border-color-focus": 300,
  "color": 950,
  "color-hover": 950,
  "color-press": 950,
  "color-focus": 950,
  "placeholder-color": 500,
  "outline-color": 400,
  "shadow-color": "shadow-4",
  "accent-background": "accent-light-600",
  "accent-color": "accent-light-50"
} as const
const dark = {
  "background": 950,
  "background-hover": 900,
  "background-press": 950,
  "background-focus": 900,
  "background-active": 900,
  "border-color": 800,
  "border-color-hover": 700,
  "border-color-press": 800,
  "border-color-focus": 700,
  "color": 50,
  "color-hover": 50,
  "color-press": 50,
  "color-focus": 50,
  "placeholder-color": 500,
  "outline-color": 400,
  "shadow-color": "shadow-4",
  "accent-background": "accent-dark-500",
  "accent-color": "accent-dark-950"
} as const

export const scales = {
  light: {
    1: light,
    2: raise(light, 1),
    3: raise(light, 2),
    4: raise(light, 3),
  },
  dark: {
    1: dark,
    2: raise(dark, -1),
    3: raise(dark, -2),
    4: raise(dark, -3),
  },
} as const

type Recipe = {
  scheme: 'light' | 'dark'
  palette: 'base-light' | 'base-dark' | 'accent-light' | 'accent-dark'
  level?: 1 | 2 | 3 | 4
}

export const tree = {
  light: { scheme: 'light', palette: 'base-light' },
  dark: { scheme: 'dark', palette: 'base-dark' },
  children: {
    ...levels(),
    accent: ({ parent }: ThemeDefinitionContext) => ({
      palette: parent.scheme === 'dark' ? 'accent-dark' : 'accent-light',
      level: 1,
      children: levels(),
    }),
    inverse: ({ parent }: ThemeDefinitionContext) => {
      const scheme = parent.scheme === 'light' ? 'dark' : 'light'
      return {
        scheme,
        palette: scheme === 'dark' ? 'base-dark' : 'base-light',
        level: 1,
        children: levels(),
      }
    },
  },
} as const

export function getTheme({ recipe }: GetThemeContext<typeof tokens, Recipe>) {
  const scale = scales[recipe.scheme][recipe.level ?? 1]
  return {
    ...ramp(recipe.palette, recipe.scheme, scale),
    ...fromShades(recipe.palette, scale),
  }
}

export const themes = createThemes(tokens, tree, { getTheme })
export type Themes = typeof themes
