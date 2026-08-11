/**
 * SPEC compartido del flujo de onboarding del rediseño (Turno 5).
 * Valores LITERALES del design doc — extraídos del par 5a/5ao
 * (design/rediseno-2026-07/screens/) y compartidos por todas las
 * pantallas del flujo. Cada pantalla agrega solo sus valores propios.
 *
 * Réplica bajo gate de aprobación del owner: no "mejorar" valores.
 */

export type OnbMode = 'light' | 'dark'

export interface OnbSpec {
  /** Fondo de pantalla. */
  bg: string
  /** Texto primario (título, input, status). */
  text: string
  /** Texto helper / captions. */
  helper: string
  /** Contador de caracteres y acentos suaves. */
  counter: string
  /** Back circular 44px. */
  backBackground: string | undefined
  backGradient: readonly [string, string] | undefined
  backShadow: string
  /** Segmentos de progreso (6px alto, radius 3, gap 8). */
  progressActive: string
  progressIdleBackground: string | undefined
  progressIdleShadow: string
  /** Hero card (radius 26, padding 15/18) con partículas ×7. */
  heroGradientCss: string
  heroShadow: string
  heroTitle: string
  heroSub: string
  /** Well de input (radius 22, padding 18, texto 24/900 centrado). */
  wellBackground: string | undefined
  wellShadow: string
  /** Chip informativo verde (radius 18, padding 11/14). */
  chipBackground: string
  chipShadow: string
  chipText: string
  chipIcon: string
  /** CTA primario del flujo (radius 24, padding 16, texto 16/900). */
  ctaBackgroundCss: string
  ctaShadow: string
  ctaText: string
  /** Colores de partículas del hero (count 7). */
  particleColors: readonly string[]
}

const PARTICLES = ['#C9F3C6', '#FBD9BC', '#EFF6E2'] as const

export const ONB_SPEC: Record<OnbMode, OnbSpec> = {
  light: {
    bg: '#DCDFCD',
    text: '#24382A',
    helper: '#8FA089',
    counter: '#3E5A44',
    backBackground: '#E9EBE0',
    backGradient: undefined,
    backShadow: '6px 6px 12px rgba(151,160,136,0.4), -6px -6px 12px rgba(255,255,255,0.9)',
    progressActive: '#24382A',
    progressIdleBackground: undefined,
    progressIdleShadow:
      'inset 2px 2px 5px rgba(151,160,136,0.4), inset -2px -2px 5px rgba(255,255,255,0.9)',
    heroGradientCss: 'linear-gradient(155deg, #337B39 0%, #4C9A52 55%, #5FAC64 100%)',
    heroShadow:
      '10px 10px 22px rgba(124,138,110,0.5), -8px -8px 18px rgba(255,255,255,0.85), inset 0 1px 0 rgba(255,255,255,0.25)',
    heroTitle: '#F7F4E4',
    heroSub: 'rgba(240,248,230,0.85)',
    wellBackground: undefined,
    wellShadow:
      'inset 4px 4px 9px rgba(151,160,136,0.4), inset -4px -4px 9px rgba(255,255,255,0.95)',
    chipBackground: '#DCEBD8',
    chipShadow:
      'inset 3px 3px 7px rgba(90,110,70,0.18), inset -3px -3px 7px rgba(255,255,255,0.85)',
    chipText: '#1F5429',
    chipIcon: '#2E7C39',
    ctaBackgroundCss: 'radial-gradient(circle at 32% 28%, #3A5A44, #1D3023 85%)',
    ctaShadow: '0 12px 24px rgba(23,40,28,0.35), inset 0 2px 3px rgba(255,255,255,0.18)',
    ctaText: '#F5F2E1',
    particleColors: PARTICLES,
  },
  dark: {
    bg: '#0F1A13',
    text: '#F1EEDD',
    helper: '#7C917A',
    counter: '#B9CCB2',
    backBackground: undefined,
    backGradient: ['#1F3527', '#14241A'],
    backShadow: '6px 6px 12px rgba(0,0,0,0.5), -6px -6px 12px rgba(101,152,113,0.1)',
    progressActive: '#F1EEDD',
    progressIdleBackground: '#142519',
    progressIdleShadow:
      'inset 2px 2px 5px rgba(0,0,0,0.5), inset -2px -2px 5px rgba(101,152,113,0.08)',
    heroGradientCss: 'linear-gradient(150deg, #234931 0%, #1B3A26 55%, #16301F 100%)',
    heroShadow:
      '10px 10px 22px rgba(0,0,0,0.6), -8px -8px 18px rgba(101,152,113,0.12), inset 0 1px 0 rgba(164,227,166,0.12)',
    heroTitle: '#F7F4E4',
    heroSub: 'rgba(240,248,230,0.85)',
    wellBackground: '#142519',
    wellShadow:
      'inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.08)',
    chipBackground: 'rgba(164,227,166,0.13)',
    chipShadow: 'inset 3px 3px 7px rgba(0,0,0,0.4)',
    chipText: '#A4E3A6',
    chipIcon: '#A4E3A6',
    ctaBackgroundCss: 'linear-gradient(145deg, #F7F4E6, #E2DEC8)',
    ctaShadow: '0 12px 24px rgba(0,0,0,0.45), inset 0 2px 3px rgba(255,255,255,0.6)',
    ctaText: '#1F3A26',
    particleColors: PARTICLES,
  },
}

/**
 * Recetas de superficie compartidas por los pasos 5d/5e/5e2 (strings
 * LITERALES, byte-idénticos en los tres specs de origen): card elevada
 * con gradiente, CTA/acento radial verde y chips hundidos/selected.
 * Lo que difiere entre pasos (fallbacks, sombras propias) queda local.
 */
export interface OnbSurfaces {
  cardGradientCss: string
  cardShadow: string
  ctaBackgroundCss: string
  ctaShadow: string
  ctaText: string
  chipIdleBackground: string | undefined
  chipIdleShadow: string
  chipSelectedText: string
  chipSelectedBackground: string
  chipSelectedShadow: string
}

export const ONB_SURFACES: Record<OnbMode, OnbSurfaces> = {
  light: {
    cardGradientCss: 'linear-gradient(145deg, #F3F4E9, #E4E6D8)',
    cardShadow: '8px 8px 18px rgba(151,160,136,0.42), -8px -8px 18px rgba(255,255,255,0.92)',
    ctaBackgroundCss: 'radial-gradient(circle at 32% 28%, #489350, #2E7434 85%)',
    ctaShadow: '0 12px 24px rgba(46,116,52,0.4), inset 0 2px 3px rgba(255,255,255,0.3)',
    ctaText: '#F5F2E1',
    chipIdleBackground: undefined,
    chipIdleShadow:
      'inset 3px 3px 7px rgba(151,160,136,0.35), inset -3px -3px 7px rgba(255,255,255,0.9)',
    chipSelectedText: '#1F5429',
    chipSelectedBackground: '#DCEBD8',
    chipSelectedShadow: 'inset 2px 2px 5px rgba(90,110,70,0.18), 0 0 0 2.5px #2E7C39',
  },
  dark: {
    cardGradientCss: 'linear-gradient(145deg, #21382A, #16281C)',
    cardShadow: '8px 8px 18px rgba(0,0,0,0.5), -8px -8px 18px rgba(101,152,113,0.1)',
    ctaBackgroundCss: 'radial-gradient(circle at 32% 28%, #9FDC9F, #3E7D46 85%)',
    ctaShadow: '0 0 26px rgba(140,225,150,0.3), inset 0 2px 3px rgba(255,255,255,0.35)',
    ctaText: '#0F1E14',
    chipIdleBackground: '#142519',
    chipIdleShadow:
      'inset 3px 3px 7px rgba(0,0,0,0.5), inset -3px -3px 7px rgba(101,152,113,0.08)',
    chipSelectedText: '#A4E3A6',
    chipSelectedBackground: 'rgba(164,227,166,0.15)',
    chipSelectedShadow: 'inset 2px 2px 5px rgba(0,0,0,0.4), 0 0 0 2.5px #A4E3A6',
  },
}

/** Cantidad de pasos de la barra de progreso del flujo (markup 5a: 5). */
export const ONB_PROGRESS_SEGMENTS = 5
