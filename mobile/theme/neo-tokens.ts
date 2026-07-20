import type { ViewStyle } from 'react-native'
import type { ResolvedThemeMode } from './palette'

/**
 * Rediseño 2026-07 — tokens neumórficos ("Rediseño Manifiesto app
 * neumórfico", Claude Design 0892036b). Fuente canónica:
 * design/rediseno-2026-07/handoff-README.md (spec final de tokens) +
 * screens/*.html (markup literal por pantalla).
 *
 * Temas: claro "Salvia" · oscuro "Noche de bosque".
 *
 * Mismo patrón de migración que la V1: se exponen namespaced y las
 * pantallas los adoptan una por una en la rama feat/ui-redesign. Las
 * sombras son strings `boxShadow` (RN 0.81 / Fabric las soporta, incluso
 * multi-sombra + inset — mismo vocabulario que authTokens.ctaShadow).
 */

/**
 * ÚNICO seam de la API experimental de gradientes CSS de RN
 * (`experimental_backgroundImage`, RN 0.81 + New Arch): todo consumidor
 * de gradientes del rediseño pasa por acá, así un rename de la prop en
 * una versión futura de RN se arregla en este archivo. El
 * `backgroundColor` de fallback pinta si el string CSS alguna vez no es
 * soportado (la prop se ignora y queda el fill sólido).
 */
export function cssGradient(css: string, fallbackColor: string): ViewStyle {
  return { experimental_backgroundImage: css, backgroundColor: fallbackColor }
}

export interface NeoShadows {
  /** Hero cards (12/26 + línea de luz superior). */
  hero: string
  /** Cards protagonistas (10/22 + línea de luz superior). */
  raisedXl: string
  /** Card estándar (8/18 — la receta canónica del handoff). */
  raisedLg: string
  /** Tiles y sub-cards (6/12). */
  raisedMd: string
  /** Chips, botones chicos (5/10). */
  raisedSm: string
  /** Wells suaves: inputs chicos, chips hundidos (2/5). */
  insetSm: string
  /** Wells medios: displays, calendarios (3/7). */
  insetMd: string
  /** Well principal del handoff: inputs, pozos grandes (4/9). */
  insetLg: string
  /** Estado seleccionado: inset + anillo verde 2.5px. */
  ringSelected: string
  /** CTA principal (sobre fill radial verde). */
  cta: string
  /** Sheets / modales flotando sobre scrim. */
  sheet: string
}

export interface NeoTokens {
  /** Fondo global de pantalla (el "material" neumórfico). */
  bg: string
  /** Fondo de login/bienvenida (solo difiere en oscuro: #0F1E14). */
  welcomeBg: string
  /** Superficie plana de referencia (fallback sin gradiente). */
  surface: string
  /** Gradiente de card raised (145deg top-left → bottom-right). */
  raisedGradient: readonly [string, string]
  /** El mismo gradiente raised como CSS listo para `cssGradient()`. */
  raisedGradientCss: string
  /** Sheets de modal (y variante alternativa). */
  sheet: string
  sheetAlt: string
  /** Scrim detrás de sheets (el diseño lo usa sólido, no negro alpha). */
  scrim: string
  /** Fondo de pozos hundidos (en claro = bg; en oscuro #142519). */
  well: string
  /** Jerarquía de texto (4 niveles del handoff). */
  text: string
  textMuted: string
  textTertiary: string
  textDim: string
  /** Verde de acción / positivo. */
  green: string
  /** Verde profundo (jerarquía, fills). */
  greenDeep: string
  /** Naranja/durazno de alertas y badges (+ variante brillante). */
  warm: string
  warmBright: string
  /** Rojo "excedido". */
  danger: string
  /** Hero verde: gradiente 3 stops (0/55/100) + tipografía sobre él. */
  heroGradient: readonly [string, string, string]
  /** El mismo hero como CSS (155deg claro / 150deg oscuro, del handoff). */
  heroGradientCss: string
  heroText: string
  heroTextSoft: string
  heroGreen: string
  heroPeach: string
  /** Labels de hero (solo oscuro tiene valor propio; claro usa heroTextSoft). */
  heroLabel: string
  /** CTA primario: radial (circle at 32% 28%) + texto encima. */
  ctaGradient: readonly [string, string]
  ctaText: string
  /** Fondo tinted de tile seleccionado (acompaña ringSelected). */
  selectedTint: string
  shadows: NeoShadows
}

const lightShadows: NeoShadows = {
  hero:         '12px 12px 26px rgba(124,138,110,0.55), -8px -8px 20px rgba(255,255,255,0.85), inset 0 1px 0 rgba(255,255,255,0.25)',
  raisedXl:     '10px 10px 22px rgba(124,138,110,0.5), -8px -8px 18px rgba(255,255,255,0.85), inset 0 1px 0 rgba(255,255,255,0.25)',
  raisedLg:     '8px 8px 18px rgba(151,160,136,0.42), -8px -8px 18px rgba(255,255,255,0.92)',
  raisedMd:     '6px 6px 12px rgba(151,160,136,0.4), -6px -6px 12px rgba(255,255,255,0.9)',
  raisedSm:     '5px 5px 10px rgba(151,160,136,0.35), -5px -5px 10px rgba(255,255,255,0.85)',
  insetSm:      'inset 2px 2px 5px rgba(151,160,136,0.3), inset -2px -2px 5px rgba(255,255,255,0.8)',
  insetMd:      'inset 3px 3px 7px rgba(151,160,136,0.35), inset -3px -3px 7px rgba(255,255,255,0.9)',
  insetLg:      'inset 4px 4px 9px rgba(151,160,136,0.4), inset -4px -4px 9px rgba(255,255,255,0.95)',
  ringSelected: 'inset 3px 3px 7px rgba(90,110,70,0.2), inset -3px -3px 7px rgba(255,255,255,0.85), 0 0 0 2.5px #2E7C39',
  cta:          '0 12px 24px rgba(46,116,52,0.4), inset 0 2px 3px rgba(255,255,255,0.3)',
  sheet:        '0 34px 80px rgba(8,14,8,0.55)',
}

const darkShadows: NeoShadows = {
  hero:         '12px 12px 26px rgba(0,0,0,0.6), -8px -8px 20px rgba(101,152,113,0.12), inset 0 1px 0 rgba(164,227,166,0.12)',
  raisedXl:     '10px 10px 22px rgba(0,0,0,0.6), -8px -8px 18px rgba(101,152,113,0.12), inset 0 1px 0 rgba(164,227,166,0.12)',
  raisedLg:     '8px 8px 18px rgba(0,0,0,0.5), -8px -8px 18px rgba(101,152,113,0.1)',
  raisedMd:     '6px 6px 12px rgba(0,0,0,0.5), -6px -6px 12px rgba(101,152,113,0.1)',
  raisedSm:     '5px 5px 10px rgba(0,0,0,0.45), -5px -5px 10px rgba(101,152,113,0.08)',
  insetSm:      'inset 2px 2px 5px rgba(0,0,0,0.45), inset -2px -2px 5px rgba(101,152,113,0.07)',
  insetMd:      'inset 3px 3px 7px rgba(0,0,0,0.5), inset -3px -3px 7px rgba(101,152,113,0.08)',
  insetLg:      'inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.08)',
  ringSelected: 'inset 3px 3px 7px rgba(0,0,0,0.4), 0 0 0 2.5px #A4E3A6',
  cta:          '0 12px 24px rgba(0,0,0,0.45), 0 0 26px rgba(140,225,150,0.3), inset 0 2px 3px rgba(255,255,255,0.3)',
  sheet:        '0 34px 80px rgba(0,0,0,0.6)',
}

const lightNeo: NeoTokens = {
  bg:             '#E9EBE0',
  welcomeBg:      '#E9EBE0',
  surface:        '#E9EBE0',
  raisedGradient: ['#F0F2E7', '#E1E4D6'],
  raisedGradientCss: 'linear-gradient(145deg, #F0F2E7, #E1E4D6)',
  sheet:          '#F0EFE3',
  sheetAlt:       '#EDECDF',
  scrim:          '#B9BEAC',
  well:           '#E9EBE0',
  text:           '#24382A',
  textMuted:      '#6C7B67',
  textTertiary:   '#9AA694',
  textDim:        '#8FA089',
  green:          '#2E7C39',
  greenDeep:      '#1F5429',
  warm:           '#C96F3F',
  warmBright:     '#D97E4F',
  danger:         '#C25B33',
  heroGradient:   ['#337B39', '#4C9A52', '#5FAC64'],
  heroGradientCss: 'linear-gradient(155deg, #337B39 0%, #4C9A52 55%, #5FAC64 100%)',
  heroText:       '#F7F4E4',
  heroTextSoft:   'rgba(240,248,230,0.8)',
  heroGreen:      '#C9F3C6',
  heroPeach:      '#FBD9BC',
  heroLabel:      'rgba(240,248,230,0.85)',
  ctaGradient:    ['#63B168', '#2E7434'],
  ctaText:        '#F5F2E1',
  selectedTint:   'rgba(46,124,57,0.1)',
  shadows:        lightShadows,
}

const darkNeo: NeoTokens = {
  bg:             '#16271C',
  welcomeBg:      '#0F1E14',
  surface:        '#1D3426',
  raisedGradient: ['#1D3426', '#132318'],
  raisedGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
  sheet:          '#1B2F22',
  sheetAlt:       '#192B1E',
  scrim:          '#0A130D',
  well:           '#142519',
  text:           '#F1EEDD',
  textMuted:      '#93A78F',
  textTertiary:   '#7C917A',
  textDim:        '#7C917A',
  green:          '#A4E3A6',
  greenDeep:      '#1F5429',
  warm:           '#F2A87E',
  warmBright:     '#F2A87E',
  danger:         '#E08765',
  heroGradient:   ['#234931', '#1B3A26', '#16301F'],
  heroGradientCss: 'linear-gradient(150deg, #234931 0%, #1B3A26 55%, #16301F 100%)',
  heroText:       '#F1EEDD',
  heroTextSoft:   'rgba(241,238,221,0.75)',
  heroGreen:      '#A4E3A6',
  heroPeach:      '#F2A87E',
  heroLabel:      '#9FB89C',
  ctaGradient:    ['#9FDC9F', '#3E7D46'],
  ctaText:        '#0F1E14',
  selectedTint:   'rgba(164,227,166,0.15)',
  shadows:        darkShadows,
}

export function neoTokens(mode: ResolvedThemeMode): NeoTokens {
  return mode === 'dark' ? darkNeo : lightNeo
}

/**
 * Radios por capa (handoff §Radios y capas). Independientes del tema.
 * hero 32 · cards 24–28 · tiles 18 · chips 14–22 · inputs 18 · nav 32 ·
 * celdas de calendario 13–14.
 */
export const neoRadii = {
  hero:         32,
  card:         26,
  cardSm:       24,
  tile:         18,
  input:        18,
  chip:         14,
  pill:         22,
  nav:          32,
  calendarCell: 14,
} as const

/**
 * Pasteles de categoría (claro). En oscuro el mismo pastel se vuelve
 * translúcido: usar `pastelDark()` (rgba al 14%, rango del doc 13–16%).
 * Iconos de categoría = emoji sobre tile pastel radius 18 (decisión de
 * producto — vocabulario original de la app).
 */
export const neoCategoryPastels = {
  mercado:       '#E2EDD2',
  transferencia: '#F6D9D2',
  ropa:          '#EDE6D4',
  mascotas:      '#D4EBDF',
  comida:        '#F7E3CF',
  ocio:          '#E6E0F4',
  hogar:         '#DDEBDD',
  salud:         '#F5D8DD',
  servicios:     '#F2ECC9',
  cuotas:        '#D6E4F0',
  vivienda:      '#EDE0C8',
  suscripciones: '#F6D9E8',
} as const

export function pastelDark(pastelHex: string, alpha = 0.14): string {
  const r = parseInt(pastelHex.slice(1, 3), 16)
  const g = parseInt(pastelHex.slice(3, 5), 16)
  const b = parseInt(pastelHex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/**
 * Variante OSCURA SÓLIDA de un pastel claro, para FONDOS de tarjeta en
 * dark mode donde la identidad de color importa (p.ej. la grilla de
 * avatares de 5b). `pastelDark()` (el mismo rgb al 13-14% de opacidad)
 * a esa alfa se lava a un tinte casi monocromo sobre el fondo oscuro:
 * todas las tarjetas terminan viéndose iguales y se pierde el color
 * distinto que sí tienen en claro. Esta función preserva el MATIZ del
 * pastel y lo baja a una luminosidad de dark mode (L 22%), subiendo la
 * saturación para que el hue siga leyéndose (los pasteles tienen S
 * baja; a L oscura sin ese bump el color quedaría gris).
 *
 * Principio del skill `color-palette`: dark mode conserva el hue, adapta
 * la lightness y sube la saturación para no lavarse. El glifo claro del
 * avatar (#F1EEDD) sobre estas variantes da ≥ 7.7:1 (AAA) en toda la
 * paleta; las tarjetas se separan del fondo por su sombra neumórfica.
 */
export function pastelDarkSolid(pastelHex: string): string {
  const r = parseInt(pastelHex.slice(1, 3), 16) / 255
  const g = parseInt(pastelHex.slice(3, 5), 16) / 255
  const b = parseInt(pastelHex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const l0 = (max + min) / 2
  let h = 0
  let s0 = 0
  if (d !== 0) {
    s0 = l0 > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  // Dark-mode target: hue intacto · L 22% · S = clamp(S_pastel × 1.6, 30, 42).
  const s = Math.min(0.42, Math.max(0.3, s0 * 1.6))
  const l = 0.22
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1))
  const m = l - c / 2
  const seg = h * 6
  let rr = 0
  let gg = 0
  let bb = 0
  if (seg < 1) [rr, gg, bb] = [c, x, 0]
  else if (seg < 2) [rr, gg, bb] = [x, c, 0]
  else if (seg < 3) [rr, gg, bb] = [0, c, x]
  else if (seg < 4) [rr, gg, bb] = [0, x, c]
  else if (seg < 5) [rr, gg, bb] = [x, 0, c]
  else [rr, gg, bb] = [c, 0, x]
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`.toUpperCase()
}

/**
 * Presets de partículas (handoff §Partículas — "CORE del producto").
 * Consumidos por <BrotParticles colors count>.
 */
export const neoParticlePresets = {
  authLight:     { colors: ['#7FB069', '#E8A87C', '#9BB894'], count: 18 },
  authDark:      { colors: ['#A4E3A6', '#F2A87E', '#F1EEDD'], count: 18 },
  celebrationDark: { colors: ['#A4E3A6', '#F2A87E', '#F1EEDD'], count: 22 },
  hero:          { colors: ['#C9F3C6', '#FBD9BC', '#EFF6E2'], count: 10 },
  weekCloseLight:  { colors: ['#C9F3C6', '#FBD9BC', '#EFF6E2'], count: 22 },
} as const

/**
 * Estados del calendario de Gastos (handoff §Estados de calendario).
 */
export const neoCalendar = {
  light: {
    ok:       { bg: '#DCEBD8', text: '#3E6B44' },
    excess:   { bg: '#F3C9BC', text: '#A84A2F' },
    today:    { bg: '#24382A', text: '#F7F4E4' },
    future:   { text: '#B3BCA8' },
  },
  dark: {
    ok:       { bg: 'rgba(164,227,166,0.16)', text: '#B5DDB4' },
    excess:   { bg: 'rgba(217,115,85,0.24)', text: '#F2A87E' },
    today:    { bg: '#F1EEDD', text: '#16271C' },
    future:   { text: '#5F7361' },
  },
} as const
