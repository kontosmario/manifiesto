import { typography } from './typography'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedThemeMode = 'light' | 'dark'

export const brand = {
  deep:         '#0F2E1F',
  bright:       '#7AD8A3',
  surfaceSoft:  'rgba(122,216,163,0.12)',
} as const

/**
 * V1 "Mint Saturado" scales — generated 2026-05-03 from the variations
 * preview (`tmp/branding-color-variations-2026-05-03.html`). Computed
 * from seeds:
 *
 *   primary  hsl(106, 75%, …)  — saturated mint, herbal carácter
 *   accent   hsl( 16, 80%, …)  — coral signal-orange
 *   surface  hsl(153, 30%, …)  — forest neutral
 *
 * Saturation is FULL across the entire ladder (no 0.80–0.95 reduction
 * for tints) — that's what makes the V1 palette read as "vivo" instead
 * of pastel.
 *
 * Phase 1: scales are exposed as exports only. `brand`, `lightColors`
 * and `darkColors` are NOT touched yet — components will migrate one
 * by one (Home first), with palette tokens flipped per-component as
 * needed. Once Home is fully on V1, we audit and consolidate.
 */
export const primaryScale = {
  50:  '#F4FDF2',
  100: '#EAFBE4',
  200: '#D1F7C5',
  300: '#A6EF8F',
  400: '#77E755',
  500: '#49D61F',
  600: '#3DB319',
  700: '#329315',
  800: '#297811',
  900: '#1F590D',
  950: '#0F2D06',
} as const

export const accentScale = {
  50:  '#FDF4F1',
  100: '#FCEAE3',
  200: '#F8D1C3',
  300: '#F2A78C',
  400: '#EC7A51',
  500: '#DC4D18',
  600: '#B84014',
  700: '#973511',
  800: '#7C2B0E',
  900: '#5C200A',
  950: '#2E1005',
} as const

export const surfaceScale = {
  50:  '#F5FAF8',
  100: '#EBF4F0',
  200: '#D4E8DF',
  300: '#ACD2C1',
  400: '#81BBA1',
  500: '#569F7E',
  600: '#478569',
  700: '#3B6D57',
  800: '#305A47',
  900: '#244235',
  950: '#12211A',
} as const

/** Cream foundation — wordmark cream from the splash. Used as
 *  foreground in dark mode and as warm paper accent in light mode. */
export const cream = {
  base:    '#F2EAD3',
  paper:   '#FAF7F0',
  paperBg: '#F4FDF2',
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
  // home redesign tokens
  heroGradient: readonly string[]
  heroAccent: string
  heroMuted: string
  heroMuted2: string
  heroText: string
  cream: string
  creamSoft: string
  creamCard: string
  line: string
  lineSoft: string
  peach: string
  peachSoft: string
  peachBand: string
  greenBand: string
  redBand: string
  auroraA: string
  auroraB: string
  auroraC: string
  shineOverlay: string
  ringBg: string
  pageBg: string
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
  text:               '#12211A',  // V1 — surface-950
  textMuted:          '#3B6D57',  // V1 — surface-700 (neutral muted, AA on cream)
  textSoft:           '#7A8A7D',
  primary:            brand.deep,
  primaryStrong:      '#0A2016',
  primarySurface:     brand.surfaceSoft,
  success:            '#1C7E3A',
  warning:            '#C27A0A',
  danger:             '#C23A2F',
  overlay:            'rgba(15,46,31,0.32)',
  heroGradient:       ['#244235', '#1F590D', '#297811', '#297811'],  // V1: forest → primary-900 → primary-800 (terminate, AA-safe for cream)
  heroAccent:         '#A6EF8F',  // V1 — primary-300
  heroMuted:          'rgba(242,234,211,0.78)',  // V1 — cream alpha
  heroMuted2:         'rgba(242,234,211,0.55)',
  heroText:           '#F2EAD3',  // V1 — cream foundation
  cream:              '#F6EFE3',
  creamSoft:          '#FAF4EA',
  creamCard:          '#FFFBF2',
  line:               '#EFE8D9',
  lineSoft:           '#E9E1D3',
  peach:              '#EC7A51',  // V1 — accent-400
  peachSoft:          '#FADFC8',
  peachBand:          '#FADFC8',
  greenBand:          '#D6EFBA',
  redBand:            '#F5C6B6',
  auroraA:            'rgba(166,239,143,0.35)',  // V1 — primary-300 alpha
  auroraB:            'rgba(242,167,140,0.28)',  // V1 — accent-300 alpha
  auroraC:            'rgba(119,231,85,0.22)',   // V1 — primary-400 alpha
  shineOverlay:       'rgba(255,255,255,0.1)',
  ringBg:             '#F6EFE3',
  pageBg:             '#EFF5E8',
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
  text:               '#F2EAD3',  // V1 — cream foundation
  textMuted:          '#A6EF8F',  // V1 — primary-300 (branded muted on dark)
  textSoft:           '#8BA797',
  primary:            brand.bright,
  primaryStrong:      '#9AE8BD',
  primarySurface:     brand.surfaceSoft,
  success:            '#7AD8A3',
  warning:            '#F3BA57',
  danger:             '#F06A6A',
  overlay:            'rgba(0,0,0,0.52)',
  heroGradient:       ['#244235', '#1F590D', '#297811', '#297811'],  // V1 dark: forest → primary-900 → primary-800 (terminate, AA-safe for cream)
  heroAccent:         '#A6EF8F',  // V1 — primary-300
  heroMuted:          'rgba(242,234,211,0.78)',
  heroMuted2:         'rgba(242,234,211,0.55)',
  heroText:           '#F2EAD3',  // V1 — cream foundation
  cream:              '#0A1410',
  creamSoft:          '#0E1A15',
  creamCard:          '#305A47',  // V1 — surface-800 (cards readable on dark forest)
  line:               '#1F332A',
  lineSoft:           '#16261E',
  peach:              '#F2A78C',  // V1 — accent-300
  peachSoft:          '#3A2A22',
  peachBand:          '#3A2A22',
  greenBand:          '#1E3A28',
  redBand:            '#3A241E',
  auroraA:            'rgba(166,239,143,0.25)',  // V1 — primary-300 alpha
  auroraB:            'rgba(242,167,140,0.22)',  // V1 — accent-300 alpha
  auroraC:            'rgba(119,231,85,0.18)',   // V1 — primary-400 alpha
  shineOverlay:       'rgba(255,255,255,0.06)',
  ringBg:             '#0A1410',
  pageBg:             '#0A1410',
}

/**
 * Auth design tokens — shared vocabulary for the new login/welcome/signup
 * screens. These are intentionally separate from the global `ThemeColors`
 * shape so the auth flow can hold its own brand expression without leaking
 * into the rest of the app.
 *
 * Import directly: `import { authTokens } from '@/theme/palette'`.
 */
export const authTokens = {
  // backgrounds
  welcomeBg:      '#0E3A26',
  formBg:         '#F2EEE3',
  surfaceCream:   '#FFFBF2',
  // accents
  peach:          '#F2B58A',
  peachSoft:      '#FADFC8',
  clay:           '#E08E63',
  plum:           '#6B3A4F',
  butter:         '#F1D690',
  // states
  focusRing:      '#1F7A4B',
  focusRingGlow:  'rgba(31,122,75,0.12)',
  strengthWeak:   '#D85A4A',
  strengthGood:   '#E08E63',
  strengthStrong: '#1F7A4B',
  // gradients (3-stop ramp for the welcome/auth panels)
  welcomeGradient: ['#0E3A26', '#165C3A', '#1F7A4B'] as const,
  ctaGradient:     ['#0E3A26', '#1F7A4B'] as const,
  // shadows (use as boxShadow strings — RN 0.76+ supports it)
  ctaShadow:    '0 14px 30px -10px rgba(15,58,38,0.4)',
  softShadow:   '0 12px 30px -10px rgba(0,0,0,0.4)',
  peachShadow:  '0 18px 40px -16px rgba(224,142,99,0.5)',
} as const

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
