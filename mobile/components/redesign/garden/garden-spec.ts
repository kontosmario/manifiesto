/**
 * Tokens de "Mi jardín" — transcripción de
 * `design/rediseno-2026-07/screens/3g.html` (marco claro "3g Mi jardín
 * claro" + marco oscuro "3g Mi jardín oscuro") y del bloque "Brot" del
 * `handoff-README.md` (L81 · L92 · L128).
 *
 * Sólo viven acá los valores PROPIOS del jardín. Todo lo que el sistema
 * ya define (radios, sombras raised/inset, tintas de texto, verde del
 * CTA, presets de partículas) se lee de `@/theme/neo-tokens` y
 * `@/theme/neo-ink` — no se duplica.
 *
 * Desvíos respecto del markup 3g, ambos con motivo:
 *
 *  [A] `heroGradientCss` — el markup dibuja el verde CLARO del lenguaje
 *      (155deg #337B39 → #4C9A52 → #5FAC64). Acá va el "forest" de
 *      Inicio/Gastos/Fijos/Control: el owner unificó el hero de todas
 *      las vistas verdes a ese gradiente (ver `fijos-spec` [D] y
 *      `gastos-spec` [OWNER-F]), y es además el único que sostiene
 *      contraste AA para tinta crema — sobre el stop #5FAC64 del verde
 *      claro NINGÚN color alcanza 4.5:1 (el máximo teórico es 2.77:1).
 *      `heroShadow` es el par literal de `gastos-spec` para ese hero.
 *
 *  [B] `todayInk` — el anillo dashed de HOY y la inicial de su columna.
 *      El markup usa `#E8A87C` en los dos temas; sobre la card clara
 *      (#E9EBE0) ese durazno da 1.69:1 y el anillo desaparece. En claro
 *      se usa el durazno corregido por contraste del sistema
 *      (`neoInk('light').warn` = #A84A2F, 4.73:1); en oscuro el durazno
 *      del sistema (#F2A87E, 6.80:1 sobre la card), que es el mismo tono
 *      del markup.
 *
 *  [C] `bloomParticles` en claro — la semana florecida (7/7) se cubre de
 *      luciérnagas. El preset `hero` del handoff es crema/menta y sobre
 *      la card clara no se ve, así que en claro el campo usa los cálidos
 *      del propio tema (verde de acción + los dos duraznos).
 */

import type { ResolvedThemeMode } from '@/theme/palette'

export interface GardenParticleColors {
  /** 2/3 de las luciérnagas. */
  base: string
  /** Cada 3ª. */
  accent: string
  /** Cada 5ª (las grandes). */
  peach: string
}

export interface GardenSpec {
  /** Hero de la racha — ver [A]. */
  heroGradientCss: string
  /** Fill sólido si el gradiente CSS no está soportado (stop dominante). */
  heroFallback: string
  heroShadow: string
  /** Eyebrow "RACHA ACTIVA", unidad y labels de la tira de stats. */
  heroLabelInk: string
  /** Número de racha + valores de la tira. */
  heroValueInk: string
  /** Línea de 1.5px que separa (y divide) la tira de stats. */
  heroDivider: string

  /** Celda de día cumplido: fill verde del calendario del sistema. */
  cellGrownBackground: string
  /** Hundido MUY suave del día cumplido (el oscuro no lleva). */
  cellGrownShadow: string | undefined
  /** Pozo de día perdido y de días fuera de rango (claro: sin fill). */
  cellWellBackground: string | undefined
  cellWellShadow: string
  /** Mismo pozo, un punto más tenue, para los días futuros/vacíos. */
  cellFutureShadow: string

  /** Anillo dashed de HOY + inicial de su columna — ver [B]. */
  todayInk: string
  /** Reemplazo donde Android descarta las sombras inset (API < 29). */
  hairline: string
  /** Luciérnagas de la semana florecida — ver [C]. */
  bloomParticles: GardenParticleColors
}

export const GARDEN_SPEC: Record<ResolvedThemeMode, GardenSpec> = {
  light: {
    heroGradientCss: 'linear-gradient(155deg, #244235 0%, #1F590D 33%, #297811 67%, #297811 100%)',
    heroFallback: '#297811',
    heroShadow:
      '12px 12px 26px rgba(124,138,110,0.55), -8px -8px 20px rgba(255,255,255,0.85), inset 0 1px 0 rgba(255,255,255,0.25)',
    heroLabelInk: '#C9F3C6',
    heroValueInk: '#F7F4E4',
    heroDivider: 'rgba(240,248,230,0.25)',

    cellGrownBackground: '#DCEBD8',
    cellGrownShadow: 'inset 2px 2px 4px rgba(90,110,70,0.15)',
    cellWellBackground: undefined,
    cellWellShadow:
      'inset 3px 3px 6px rgba(151,160,136,0.35), inset -3px -3px 6px rgba(255,255,255,0.85)',
    cellFutureShadow:
      'inset 3px 3px 6px rgba(151,160,136,0.28), inset -3px -3px 6px rgba(255,255,255,0.8)',

    todayInk: '#A84A2F',
    hairline: 'rgba(151,160,136,0.25)',
    bloomParticles: { base: '#2E7C39', accent: '#C96F3F', peach: '#D97E4F' },
  },
  dark: {
    heroGradientCss: 'linear-gradient(155deg, #244235 0%, #1F590D 33%, #297811 67%, #297811 100%)',
    heroFallback: '#297811',
    heroShadow:
      '14px 14px 30px rgba(0,0,0,0.5), -6px -6px 16px rgba(101,152,113,0.14), inset 0 1px 0 rgba(164,227,166,0.18)',
    heroLabelInk: '#C9F3C6',
    heroValueInk: '#F7F4E4',
    heroDivider: 'rgba(164,227,166,0.18)',

    cellGrownBackground: 'rgba(164,227,166,0.14)',
    cellGrownShadow: undefined,
    cellWellBackground: '#142519',
    cellWellShadow:
      'inset 3px 3px 6px rgba(0,0,0,0.45), inset -3px -3px 6px rgba(101,152,113,0.07)',
    cellFutureShadow:
      'inset 3px 3px 6px rgba(0,0,0,0.4), inset -3px -3px 6px rgba(101,152,113,0.06)',

    todayInk: '#F2A87E',
    hairline: 'rgba(101,152,113,0.18)',
    bloomParticles: { base: '#EFF6E2', accent: '#C9F3C6', peach: '#FBD9BC' },
  },
}

/** Geometría literal de 3g (idéntica en los dos temas). */
export const GARDEN_GEOMETRY = {
  heroRadius: 32,
  cardRadius: 28,
  bannerRadius: 24,
  /** Celda de calendario del handoff. */
  cellRadius: 14,
  cellHeight: 44,
  cellGap: 7,
  /** Mini-Brot de la grilla (`animated="false"` — 35 canvas estáticos). */
  cellBrotSize: 32,
  /** Brot `wave` del header y `cheer` del banner. */
  headerBrotSize: 52,
  /** Botón circular de volver. */
  backSize: 44,
  todayRingWidth: 2.5,
  /** Fila de mini-Brots del cierre de semana. */
  weekCloseBrotSize: 34,
  /** Brot `cheer` protagonista del cierre de semana. */
  weekCloseHeroBrotSize: 150,
} as const
