export const Colors = {
  light: {
    text: '#11181C',
    background: '#FFFFFF',
    tint: '#0A7EA4',
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: '#0A7EA4',
    surface: '#F4F7F8',
    border: '#D7E0E4',
    muted: '#687076',
    accent: '#0A7EA4',
    accentText: '#FFFFFF',
    danger: '#C62828',
  },
  dark: {
    text: '#F2F5F3',
    background: '#07130F',
    tint: '#7FD38A',
    icon: '#8BA396',
    tabIconDefault: '#5F776B',
    tabIconSelected: '#7FD38A',
    surface: '#10201A',
    border: '#20372D',
    muted: '#91A79B',
    accent: '#7FD38A',
    accentText: '#07210E',
    danger: '#FF8C8C',
  },
} as const

export const Fonts = {
  sans: 'System',
  serif: 'Times New Roman',
  rounded: 'System',
  mono: 'Menlo',
} as const