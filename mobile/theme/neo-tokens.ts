import type { ViewStyle } from 'react-native'
import type { ResolvedThemeMode } from './palette'
import { applyPaintTier, FLAT_PAINT_TIER, FLAT_TIER_SOLID_FILLS } from './paint-tier'

/**
 * Rediseño 2026-07 — tokens neumórficos. Fuente canónica:
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
  // Fase 2 del tier de gama baja (hoy apagada — ver paint-tier.ts): en
  // hardware viejo el fill sólido de fallback reemplaza al shader.
  if (FLAT_PAINT_TIER && FLAT_TIER_SOLID_FILLS) {
    return { backgroundColor: fallbackColor }
  }
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
  /**
   * Sheets / modales anclados al borde inferior. Sombra HACIA ARRIBA
   * (`0 -20px …`): la hoja está pegada abajo, así que su único borde
   * libre es el superior y es ahí donde tiene que despegarse del
   * contenido. Valor literal del handoff (`screens/3c.html` L31 claro /
   * L87 oscuro), el mismo que ya usaba `onb-numpad`.
   */
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
  /**
   * Píldora de arrastre en el borde superior de la hoja (44×5, radio 3).
   * No es un `textDim` ni un `border`: el handoff le da un valor propio
   * en cada tema (`screens/3c.html` L32 / L88).
   */
  sheetHandle: string
  /**
   * Separador entre filas DENTRO de una hoja. El neumorfismo evita
   * bordes, pero las listas de acciones del handoff sí llevan una línea
   * de 1.5px (`screens/3c.html` L46 / L102) — es el único hairline del
   * vocabulario, y sólo aplica entre ítems de una misma lista.
   */
  sheetDivider: string
  /** Fondo de pozos hundidos (en claro = bg; en oscuro #142519). */
  well: string
  /**
   * Jerarquía de texto (4 niveles del handoff). Sólo los dos primeros son
   * tintas de TEXTO: `textTertiary` y `textDim` dan 1.87:1 y 2.05:1 sobre
   * `bg` en claro, así que valen para placeholders, glifos de relleno y
   * separadores, nunca para una línea que haya que leer.
   */
  text: string
  /**
   * Segundo nivel de lectura: eyebrows, helpers, subtítulos, footnotes,
   * labels de hero, metadatos de fila.
   *
   * En claro NO es el `#6C7B67` que escribe el handoff. Ese valor da
   * 3.32:1 sobre `bg`, 3.49:1 sobre el peor stop del material raised y
   * 3.89:1 sobre `sheet` — bajo el 4.5:1 que AA exige para los 11-12px en
   * los que este token se usa. El valor de acá es el MISMO salvia (hue
   * Lab 137, croma 14.5 contra 13.2 del original) un escalón más oscuro,
   * y llega a ≥4.67:1 contra todas las superficies claras del
   * vocabulario. Volver al hex del handoff reintroduce la falla.
   *
   * En oscuro el valor del handoff sí pasa (5.20:1 en el peor caso) y se
   * conserva tal cual.
   */
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

// Las dos tablas de sombras pasan por el tier de pintura al cargar el
// módulo: en gama baja (`FLAT_PAINT_TIER`) cada receta queda aplanada a
// una key shadow + capas blur-0; en hardware capaz son estos literales
// tal cual (identidad, sin costo).
const lightShadows: NeoShadows = applyPaintTier({
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
  sheet:        '0 -20px 50px rgba(20,30,18,0.35)',
})

const darkShadows: NeoShadows = applyPaintTier({
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
  sheet:        '0 -20px 50px rgba(0,0,0,0.6)',
})

const lightNeo: NeoTokens = {
  bg:             '#DCDFCD',
  welcomeBg:      '#DCDFCD',
  surface:        '#E9EBE0',
  raisedGradient: ['#F0F2E7', '#E1E4D6'],
  raisedGradientCss: 'linear-gradient(145deg, #F0F2E7, #E1E4D6)',
  sheet:          '#F0EFE3',
  sheetAlt:       '#EDECDF',
  scrim:          '#B9BEAC',
  sheetHandle:    '#C6CAB8',
  sheetDivider:   'rgba(151,160,136,0.25)',
  well:           '#E9EBE0',
  text:           '#24382A',
  textMuted:      '#54644F',
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
  // El foco del radial NO es el `#63B168` del handoff: con la tinta crema
  // encima ese stop da 2.33:1 y el label (bold 16) no llega ni al 3:1 de
  // texto grande. `#489350` es el valor más claro de la familia que pasa
  // con margen (3.36:1) conservando el degradé. El tema oscuro no aplica:
  // ahí la receta se invierte (tinta casi negra sobre verde claro) y su
  // punto flojo, el borde, ya da 3.48:1.
  ctaGradient:    ['#489350', '#2E7434'],
  ctaText:        '#F5F2E1',
  selectedTint:   'rgba(46,124,57,0.1)',
  shadows:        lightShadows,
}

const darkNeo: NeoTokens = {
  bg:             '#0F1A13',
  welcomeBg:      '#0F1E14',
  surface:        '#1D3426',
  raisedGradient: ['#1D3426', '#132318'],
  raisedGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
  sheet:          '#1B2F22',
  sheetAlt:       '#192B1E',
  scrim:          '#0A130D',
  sheetHandle:    '#3A5241',
  sheetDivider:   'rgba(101,152,113,0.18)',
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
 * El material neumórfico como ESTILO suelto, para views que ya existen y solo
 * necesitan cambiar de piel.
 *
 * `NeoSurface` sigue siendo la forma preferida: es un componente y se lee mejor.
 * Este helper es para el caso en que reestructurar el JSX (envolver, mover
 * children, reubicar el cierre) sería un cambio grande y riesgoso a cambio de
 * nada visual — típicamente una card V1 que ya trae su `borderRadius` en el
 * StyleSheet y solo le estaba pasando `backgroundColor` inline. Se usó así al
 * migrar Ajustes (2026-08-05).
 *
 * Devuelve el mismo par (gradiente + receta de sombra) que aplica `NeoSurface`,
 * así que las dos rutas producen píxeles idénticos.
 */
export function neoMaterial(mode: ResolvedThemeMode, variant: keyof NeoShadows = 'raisedLg'): ViewStyle {
  const neo = neoTokens(mode)
  const isHero = variant === 'hero'
  const isRaised = variant.startsWith('raised')
  const isInset = variant.startsWith('inset') || variant === 'ringSelected'

  if (isHero || isRaised) {
    return {
      ...cssGradient(
        isHero ? neo.heroGradientCss : neo.raisedGradientCss,
        isHero ? neo.heroGradient[1] : neo.surface,
      ),
      boxShadow: neo.shadows[variant],
    }
  }

  return {
    backgroundColor: variant === 'sheet' ? neo.sheet : isInset ? neo.well : neo.surface,
    boxShadow: neo.shadows[variant],
  }
}

/**
 * Radios por capa (handoff §Radios y capas). Independientes del tema.
 * hero 32 · cards 24–28 · tiles 18 · chips 14–22 · inputs 18 · nav 32 ·
 * celdas de calendario 13–14 · esquinas superiores de hoja 34.
 */
export const neoRadii = {
  hero:         32,
  /**
   * Sólo las esquinas SUPERIORES de una hoja anclada abajo. El handoff
   * la dibuja como `34px 34px 46px 46px`, donde el 46 es el radio del
   * marco del teléfono en la maqueta: en el dispositivo la hoja llega a
   * borde y las esquinas de abajo las recorta la pantalla, así que sólo
   * el 34 es un valor nuestro.
   */
  sheet:        34,
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
