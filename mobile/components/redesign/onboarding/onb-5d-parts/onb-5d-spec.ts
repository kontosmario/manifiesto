import { pastelDark } from '@/theme/neo-tokens'
import { ONB_SURFACES, type OnbMode } from '../onb-spec'

// @i18n-ignore-file — réplica dev-only del design doc; copy literal del mockup.

/**
 * SPEC del paso 5d (Tus ingresos) — valores LITERALES de los pares
 * 5d…5d5 (claro) y 5do…5d5o (oscuro) del design doc. Solo lo que este
 * paso agrega por encima de ONB_SPEC; las superficies compartidas con
 * 5e/5e2 (card gradient/shadow, radial verde) referencian ONB_SURFACES
 * (strings byte-idénticos a los que este spec traía inline).
 */

export interface Onb5dSpec {
  /** Etiquetas de sección (11.5/800, tracking 0.16em). */
  sectionLabel: string
  /** Cards con gradiente (tiles no seleccionados, monto, día, stepper). */
  cardGradientCss: string
  cardFallback: string
  /** Dos sombras literales de card grande en el doc (claro difiere). */
  cardShadowStrong: string
  cardShadowSoft: string
  /** Tile de selección — seleccionado (anillo verde 2.5px). */
  tileSelectedBackground: string
  tileSelectedShadow: string
  tileSelectedTitle: string
  tileSelectedSub: string
  /** Tile de selección — no seleccionado. */
  tileIdleShadow: string
  tileIdleGridShadow: string
  tileIdleTitle: string
  tileIdleSub: string
  /** Cajita de ícono 42×42 del tile de tipo. */
  tileIconSelectedBg: string
  tileIconFijoBg: string
  tileIconVariableBg: string
  /** Radial verde de acento (badge check, día activo, botón +). */
  accentRadialCss: string
  accentRadialFallback: string
  checkStroke: string
  /** Card informativa del caso variable. */
  infoCircleBg: string
  infoCircleShadow: string
  infoText: string
  /** Card de monto. */
  montoKicker: string
  montoEdit: string
  montoAmount: string
  /** Stepper custom (cada N días). */
  stepperMinusGradientCss: string
  stepperMinusFallback: string
  stepperMinusShadow: string
  stepperMinusIcon: string
  stepperPlusShadow: string
  stepperPlusIcon: string
  stepperValue: string
  stepperUnit: string
  /** Celdas del calendario de 31 días y pills de semana. */
  dayIdleBg: string | undefined
  dayIdleShadow: string
  dayIdleText: string
  daySelectedText: string
  daySelectedShadow: string
  weekIdleShadow: string
  /** Caption bajo el selector de día. */
  caption: string
  captionAccent: string
}

export const ONB_5D_SPEC: Record<OnbMode, Onb5dSpec> = {
  light: {
    sectionLabel: '#54644F',
    cardGradientCss: ONB_SURFACES.light.cardGradientCss,
    cardFallback: '#E4E6D8',
    cardShadowStrong: ONB_SURFACES.light.cardShadow,
    cardShadowSoft:
      '8px 8px 18px rgba(151,160,136,0.4), -8px -8px 18px rgba(255,255,255,0.9)',
    tileSelectedBackground: '#DCEBD8',
    tileSelectedShadow:
      'inset 3px 3px 7px rgba(90,110,70,0.2), inset -3px -3px 7px rgba(255,255,255,0.85), 0 0 0 2.5px #2E7C39',
    tileSelectedTitle: '#1F5429',
    tileSelectedSub: '#4E6B54',
    tileIdleShadow: '6px 6px 14px rgba(151,160,136,0.4), -6px -6px 14px rgba(255,255,255,0.9)',
    tileIdleGridShadow:
      '5px 5px 10px rgba(151,160,136,0.35), -5px -5px 10px rgba(255,255,255,0.85)',
    tileIdleTitle: '#24382A',
    tileIdleSub: '#54644F',
    tileIconSelectedBg: '#F0EFE3',
    tileIconFijoBg: '#F2ECC9',
    tileIconVariableBg: '#D4EBDF',
    accentRadialCss: ONB_SURFACES.light.ctaBackgroundCss,
    accentRadialFallback: '#2E7434',
    checkStroke: '#F5F2E1',
    infoCircleBg: '#DDEBDD',
    infoCircleShadow:
      'inset 3px 3px 6px rgba(90,110,70,0.18), inset -3px -3px 6px rgba(255,255,255,0.85)',
    infoText: '#24382A',
    montoKicker: '#54644F',
    montoEdit: '#2E7C39',
    montoAmount: '#24382A',
    stepperMinusGradientCss: 'linear-gradient(145deg, #F3F4E9, #E0E3D4)',
    stepperMinusFallback: '#E0E3D4',
    stepperMinusShadow:
      '5px 5px 11px rgba(151,160,136,0.45), -5px -5px 11px rgba(255,255,255,0.95)',
    stepperMinusIcon: '#24382A',
    stepperPlusShadow: '0 8px 16px rgba(46,116,52,0.35), inset 0 2px 3px rgba(255,255,255,0.3)',
    stepperPlusIcon: '#F5F2E1',
    stepperValue: '#24382A',
    stepperUnit: '#54644F',
    dayIdleBg: undefined,
    dayIdleShadow:
      'inset 2px 2px 5px rgba(151,160,136,0.3), inset -2px -2px 5px rgba(255,255,255,0.8)',
    dayIdleText: '#3E5A44',
    daySelectedText: '#F5F2E1',
    daySelectedShadow: '0 6px 12px rgba(46,116,52,0.3), inset 0 1.5px 2px rgba(255,255,255,0.3)',
    weekIdleShadow:
      'inset 3px 3px 7px rgba(151,160,136,0.32), inset -3px -3px 7px rgba(255,255,255,0.85)',
    caption: '#3E5A44',
    captionAccent: '#2E7C39',
  },
  dark: {
    sectionLabel: '#93A78F',
    cardGradientCss: ONB_SURFACES.dark.cardGradientCss,
    cardFallback: '#16281C',
    cardShadowStrong: ONB_SURFACES.dark.cardShadow,
    // En oscuro el doc usa la misma sombra para ambas variantes.
    cardShadowSoft: ONB_SURFACES.dark.cardShadow,
    tileSelectedBackground: 'rgba(164,227,166,0.15)',
    tileSelectedShadow: 'inset 3px 3px 7px rgba(0,0,0,0.4), 0 0 0 2.5px #A4E3A6',
    tileSelectedTitle: '#A4E3A6',
    tileSelectedSub: '#9FB89C',
    tileIdleShadow: '6px 6px 14px rgba(0,0,0,0.5), -6px -6px 14px rgba(101,152,113,0.1)',
    tileIdleGridShadow: '5px 5px 10px rgba(0,0,0,0.45), -5px -5px 10px rgba(101,152,113,0.08)',
    tileIdleTitle: '#F1EEDD',
    tileIdleSub: '#93A78F',
    // pastelDark() sobre el pastel claro reproduce exactamente los
    // rgba literales del mockup oscuro.
    tileIconSelectedBg: pastelDark('#F0EFE3', 0.14),
    tileIconFijoBg: pastelDark('#F2ECC9', 0.13),
    tileIconVariableBg: pastelDark('#D4EBDF', 0.13),
    accentRadialCss: ONB_SURFACES.dark.ctaBackgroundCss,
    accentRadialFallback: '#3E7D46',
    checkStroke: '#F5F2E1',
    infoCircleBg: 'rgba(221,235,221,0.14)',
    // Literal del doc: el mockup oscuro repite la sombra clara acá.
    infoCircleShadow:
      'inset 3px 3px 6px rgba(90,110,70,0.18), inset -3px -3px 6px rgba(255,255,255,0.85)',
    infoText: '#F1EEDD',
    montoKicker: '#93A78F',
    montoEdit: '#A4E3A6',
    montoAmount: '#F1EEDD',
    stepperMinusGradientCss: 'linear-gradient(145deg, #2A4433, #1A2E21)',
    stepperMinusFallback: '#1A2E21',
    stepperMinusShadow: '5px 5px 11px rgba(0,0,0,0.55), -5px -5px 11px rgba(101,152,113,0.12)',
    stepperMinusIcon: '#F1EEDD',
    stepperPlusShadow: '0 0 20px rgba(140,225,150,0.28), inset 0 2px 3px rgba(255,255,255,0.35)',
    stepperPlusIcon: '#0F1E14',
    stepperValue: '#F1EEDD',
    stepperUnit: '#93A78F',
    dayIdleBg: '#142519',
    dayIdleShadow:
      'inset 2px 2px 5px rgba(0,0,0,0.45), inset -2px -2px 5px rgba(101,152,113,0.07)',
    dayIdleText: '#B9CCB2',
    daySelectedText: '#0F1E14',
    daySelectedShadow: '0 0 18px rgba(140,225,150,0.25), inset 0 1.5px 2px rgba(255,255,255,0.35)',
    weekIdleShadow: 'inset 3px 3px 7px rgba(0,0,0,0.5), inset -3px -3px 7px rgba(101,152,113,0.08)',
    caption: '#B9CCB2',
    captionAccent: '#A4E3A6',
  },
}
