import { typography } from './typography'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedThemeMode = 'light' | 'dark'

export const brand = {
  deep:         '#329315',                   // V1 primary-700 (was old splash forest)
  bright:       '#A6EF8F',                   // V1 primary-300 (was old splash mint)
  surfaceSoft:  'rgba(166,239,143,0.12)',    // V1 primary-300 alpha (was rgba(122,216,163,…))
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
  /** Texto/ícono legible SOBRE un fill `primary` (cambia por modo). */
  textOnPrimary: string
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
  // garden / streak tokens — "Mi jardín"
  gardenSoil: string
  gardenSoilFern: string
  gardenSkipped: string
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

// Dark-mode canvas for the primary tab screens (Home, Gastos, Fijos,
// Control). A near-black with a whisper of brand green (never pure
// #000). User feedback: the global forest-green dark background
// (#12211A) plus the bright aurora glows read as "too green" and tired
// the eye. These screens override their <Screen backgroundColor> to
// this value in dark mode; the muted-green surfaces (surfaceMuted
// #0F2E1F) float on top. The global `background` token is untouched so
// Settings, onboarding, and modal flows keep the forest canvas.
export const DARK_TAB_CANVAS = '#0A0F0C'

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
  textSoft:           '#3B6D57',  // V1 — surface-700 (AA on cream; same hex as textMuted for now)
  primary:            '#297811',  // V1 — primary-800 (AA-safe on creamCard 5.37:1)
  textOnPrimary:      '#F2EAD3',  // crema sobre el fill primary forest (AA en light)
  primaryStrong:      '#1F590D',  // V1 — primary-900 (hierarchy below primary)
  primarySurface:     'rgba(166,239,143,0.12)',  // V1 — primary-300 alpha
  success:            '#297811',  // V1 — primary-800 (AA on cream; collapsed to primary, AA over differentiation)
  warning:            '#9A5E04',  // oscurecido para AA como texto chico (era #C27A0A → 2.9-3.4:1)
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
  peach:              '#B84014',  // V1 — accent-600 (AA on cream 5.38:1)
  peachSoft:          '#FADFC8',
  peachBand:          '#F8D1C3',  // V1 — accent-200 (icon tile bg, soft warm pastel)
  greenBand:          '#D6EFBA',
  redBand:            '#F5C6B6',
  auroraA:            'rgba(166,239,143,0.35)',  // V1 — primary-300 alpha
  auroraB:            'rgba(242,167,140,0.28)',  // V1 — accent-300 alpha
  auroraC:            'rgba(119,231,85,0.22)',   // V1 — primary-400 alpha
  shineOverlay:       'rgba(255,255,255,0.1)',
  ringBg:             '#FAF7F0',  // V1 — paper foundation (matches eventual V1 canvas)
  pageBg:             '#F4FDF2',  // V1 — primary-50 (faint mint paper)
  gardenSoil:         '#E3F1D4',  // tile de brote (semilla/germinación) — verde legible sobre creamCard
  gardenSoilFern:     '#D2E9BF',  // tile de planta arraigada (verde más vivo)
  gardenSkipped:      '#ECE7DB',  // tile de día salteado (neutro cálido, sin culpa)
}

const darkColors: ThemeColors = {
  canvas:             '#12211A',  // V1 — surface-950 (less OLED-black, forest-tinted dark)
  background:         '#12211A',
  backgroundElevated: '#102018',
  surface:            '#102018',
  surfaceMuted:       '#0F2E1F',
  surfaceStrong:      '#17301F',
  border:             'rgba(255,255,255,0.06)',
  borderStrong:       'rgba(255,255,255,0.12)',
  text:               '#F2EAD3',  // V1 — cream foundation
  textMuted:          '#A6EF8F',  // V1 — primary-300 (branded muted on dark)
  textSoft:           '#77E755',  // V1 — primary-400 (AA on creamCard dark 4.98:1)
  primary:            '#A6EF8F',  // V1 — primary-300 (was brand.bright #7AD8A3)
  textOnPrimary:      '#0F2D06',  // verde-casi-negro sobre el fill primary mint (AA en dark)
  primaryStrong:      '#D1F7C5',  // V1 — primary-200
  primarySurface:     'rgba(166,239,143,0.12)',  // V1 — primary-300 alpha
  success:            '#A6EF8F',  // V1 — primary-300 (matches primary on dark)
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
  peach:              '#F8D1C3',  // V1 — accent-200 (AA on creamCard dark 5.56:1)
  peachSoft:          '#3A2A22',
  peachBand:          '#5C200A',  // V1 — accent-900 (deep warm icon tile on dark creamCard)
  greenBand:          '#1E3A28',
  redBand:            '#3A241E',
  auroraA:            'rgba(166,239,143,0.25)',  // V1 — primary-300 alpha
  auroraB:            'rgba(242,167,140,0.22)',  // V1 — accent-300 alpha
  auroraC:            'rgba(119,231,85,0.18)',   // V1 — primary-400 alpha
  shineOverlay:       'rgba(255,255,255,0.06)',
  ringBg:             '#12211A',  // V1 — surface-950 (matches eventual V1 canvas)
  pageBg:             '#12211A',  // V1 — surface-950 (matches canvas)
  gardenSoil:         'rgba(166,239,143,0.13)',  // tile de brote sobre dark forest
  gardenSoilFern:     'rgba(166,239,143,0.22)',  // tile de planta arraigada
  gardenSkipped:      'rgba(255,255,255,0.06)',  // tile de día salteado (faint)
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
