import { typography } from './typography'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedThemeMode = 'light' | 'dark'

export const brand = {
  deep:         '#0F2E1F',
  bright:       '#7AD8A3',
  surfaceSoft:  'rgba(122,216,163,0.12)',
} as const

export interface ThemeColors {
  canvas: string
  background: string          // alias of canvas — kept for backward compat during migration
  backgroundElevated: string  // alias of surface
  surface: string
  surfaceMuted: string
  surfaceStrong: string
  border: string
  borderStrong: string
  text: string
  textMuted: string
  textSoft: string
  primary: string             // brand.deep in light / brand.bright in dark
  primaryStrong: string
  primarySurface: string
  success: string
  warning: string
  danger: string
  overlay: string
}

export interface AppTheme {
  colors: ThemeColors
  brand: typeof brand
  isDark: boolean
  mode: ResolvedThemeMode
  spacing: {
    xxs: number
    xs: number
    sm: number
    md: number
    lg: number
    xl: number
    xxl: number
  }
  radii: {
    xs: number
    sm: number
    md: number
    lg: number
    xl: number
    '2xl': number
    pill: number
  }
  typography: typeof typography
}

/**
 * Deprecated — to be deleted at the end of Foundation Phase 1 (PR #1).
 * Use `theme.spacing` with the new 4-base scale instead.
 */
export const legacySpacing = {
  xs:  6,
  sm:  10,
  md:  14,
  lg:  18,
  xl:  24,
  xxl: 32,
} as const

/** Radius scale — identical for light and dark modes. */
export const radii = {
  xs:    8,
  sm:    10,
  md:    14,
  lg:    18,
  xl:    22,
  '2xl': 28,
  pill:  999,
} as const

const baseTheme = {
  spacing: {
    xxs: 4,
    xs:  8,
    sm:  12,
    md:  16,
    lg:  24,
    xl:  32,
    xxl: 48,
  },
  radii,
}

const lightColors: ThemeColors = {
  canvas:             '#F4F2ED',
  background:         '#F4F2ED',  // backward-compat alias
  backgroundElevated: '#FFFFFF',
  surface:            '#FFFFFF',
  surfaceMuted:       '#EEE9DF',
  surfaceStrong:      '#E4DFD3',
  border:             'rgba(15,46,31,0.08)',
  borderStrong:       'rgba(15,46,31,0.15)',
  text:               '#0F2E1F',
  textMuted:          '#6B7566',
  textSoft:           '#7A8A7D',
  primary:            brand.deep,
  primaryStrong:      '#0A2016',
  primarySurface:     brand.surfaceSoft,
  success:            '#1C7E3A',
  warning:            '#C27A0A',
  danger:             '#C23A2F',
  overlay:            'rgba(15,46,31,0.32)',
}

const darkColors: ThemeColors = {
  canvas:             '#0A1A12',
  background:         '#0A1A12',
  backgroundElevated: '#102018',
  surface:            '#102018',
  surfaceMuted:       '#0F2E1F',
  surfaceStrong:      '#17301F',
  border:             'rgba(255,255,255,0.06)',
  borderStrong:       'rgba(255,255,255,0.12)',
  text:               '#F8FBF8',
  textMuted:          '#B8C9BE',
  textSoft:           '#6B8F78',
  primary:            brand.bright,
  primaryStrong:      '#9AE8BD',
  primarySurface:     brand.surfaceSoft,
  success:            '#7AD8A3',
  warning:            '#F3BA57',
  danger:             '#F06A6A',
  overlay:            'rgba(0,0,0,0.52)',
}

export function buildTheme(mode: ResolvedThemeMode): AppTheme {
  return {
    colors: mode === 'dark' ? darkColors : lightColors,
    brand,
    isDark: mode === 'dark',
    mode,
    spacing: baseTheme.spacing,
    radii: baseTheme.radii,
    typography,
  }
}
