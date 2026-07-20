/**
 * Tokens de la pantalla del Plan (4m/4mo · paywall) — valores LITERALES
 * de design/rediseno-2026-07/screens/4m.html (claro) y 4mo.html
 * (oscuro). Vive separado de auth-spec.ts (mismo criterio que onb-spec)
 * para no inflar el spec de auth ya aprobado: acá van SOLO los tokens
 * propios del plan; los compartidos (bg, text, chrome, helper, CTA
 * verde primario, legalText) se leen de AUTH_SPEC en la pantalla.
 *
 * Réplica bajo gate de aprobación: no "mejorar" valores.
 */
import type { AuthMode } from './auth-spec'

export interface PlanSpec {
  // Trial card (Acceso completo · N días).
  trialBackground: string
  trialShadow: string
  trialCircleBackground: string
  trialCircleShadow: string
  lockStroke: string
  trialTitle: string
  trialDays: string
  // Badge "HOGAR" del wordmark.
  hogarBadgeText: string
  hogarBadgeShadow: string
  // Card MENSUAL (neumórfica neutra).
  monthCardCss: string
  monthCardFallback: string
  monthCardShadow: string
  monthLabel: string
  monthPrice: string
  monthPer: string
  monthMeta: string
  // Card ANUAL (verde, destacada, con partículas).
  yearCardCss: string
  yearCardFallback: string
  yearCardShadow: string
  yearParticles: readonly string[]
  yearLabel: string
  yearBadgeText: string
  yearBadgeBackground: string
  yearPrice: string
  yearPer: string
  yearMeta: string
  // Burbuja coach del ahorro.
  bubbleText: string
  bubbleBackground: string
  bubbleShadow: string
  // Features (check + texto).
  checkStroke: string
  featureText: string
  // CTA secundario (inset, texto verde).
  subscribeText: string
  subscribeBackground: string | undefined
  subscribeShadow: string
  // Anillo de selección de las cards (vocabulario aprobado del rediseño:
  // 0 0 0 2.5px — el del onboarding/PIN). Por card porque la anual es
  // verde oscura y el anillo verde del tema claro no contrasta sobre
  // ella: usa el menta de su badge.
  monthRing: string
  yearRing: string
}

export const PLAN_SPEC: Record<AuthMode, PlanSpec> = {
  light: {
    trialBackground: '#DCEBD8',
    trialShadow:
      'inset 3px 3px 7px rgba(90,110,70,0.18), inset -3px -3px 7px rgba(255,255,255,0.85)',
    trialCircleBackground: '#F0EFE3',
    trialCircleShadow: '0 2px 6px rgba(60,90,50,0.15)',
    lockStroke: '#2E7C39',
    trialTitle: '#1F5429',
    trialDays: '#4E6B54',
    hogarBadgeText: '#2E7C39',
    hogarBadgeShadow:
      'inset 2px 2px 5px rgba(151,160,136,0.35), inset -2px -2px 5px rgba(255,255,255,0.9)',
    monthCardCss: 'linear-gradient(145deg, #F3F4E9, #E4E6D8)',
    monthCardFallback: '#ECEDE1',
    monthCardShadow:
      '8px 8px 18px rgba(151,160,136,0.42), -8px -8px 18px rgba(255,255,255,0.92)',
    monthLabel: '#6C7B67',
    monthPrice: '#24382A',
    monthPer: '#6C7B67',
    monthMeta: '#6C7B67',
    yearCardCss: 'linear-gradient(155deg, #337B39 0%, #4C9A52 55%, #5FAC64 100%)',
    yearCardFallback: '#4C9A52',
    yearCardShadow:
      '10px 10px 22px rgba(124,138,110,0.5), -8px -8px 18px rgba(255,255,255,0.85), inset 0 1px 0 rgba(255,255,255,0.25)',
    yearParticles: ['#C9F3C6', '#FBD9BC', '#EFF6E2'],
    yearLabel: 'rgba(240,248,230,0.85)',
    yearBadgeText: '#1F5429',
    yearBadgeBackground: '#C9F3C6',
    yearPrice: '#F7F4E4',
    yearPer: 'rgba(240,248,230,0.75)',
    yearMeta: 'rgba(240,248,230,0.85)',
    bubbleText: '#1F5429',
    bubbleBackground: '#DCEBD8',
    bubbleShadow:
      'inset 3px 3px 7px rgba(90,110,70,0.18), inset -3px -3px 7px rgba(255,255,255,0.85)',
    checkStroke: '#2E7C39',
    featureText: '#3E5A44',
    subscribeText: '#2E7C39',
    // Sin bg: el inset lee sobre el bg del frame (#E9EBE0). En RN hay que
    // setear ese mismo color de superficie para que el inset se vea.
    subscribeBackground: '#E9EBE0',
    subscribeShadow:
      'inset 4px 4px 9px rgba(151,160,136,0.38), inset -4px -4px 9px rgba(255,255,255,0.92)',
    monthRing: '#2E7C39',
    yearRing: '#C9F3C6',
  },
  dark: {
    trialBackground: 'rgba(164,227,166,0.13)',
    trialShadow: 'inset 3px 3px 7px rgba(0,0,0,0.4)',
    trialCircleBackground: '#1B2F22',
    trialCircleShadow: '0 2px 6px rgba(60,90,50,0.15)',
    lockStroke: '#A4E3A6',
    trialTitle: '#A4E3A6',
    trialDays: '#9FB89C',
    hogarBadgeText: '#A4E3A6',
    // NOTA: el mock oscuro usa el MISMO shadow del claro (highlight
    // blanco) — probable copy-paste; se transcribe literal (gate).
    hogarBadgeShadow:
      'inset 2px 2px 5px rgba(151,160,136,0.35), inset -2px -2px 5px rgba(255,255,255,0.9)',
    monthCardCss: 'linear-gradient(145deg, #21382A, #16281C)',
    monthCardFallback: '#1B3023',
    monthCardShadow: '8px 8px 18px rgba(0,0,0,0.5), -8px -8px 18px rgba(101,152,113,0.1)',
    monthLabel: '#93A78F',
    monthPrice: '#F1EEDD',
    monthPer: '#93A78F',
    monthMeta: '#93A78F',
    // OJO: 150deg en oscuro (155deg en claro).
    yearCardCss: 'linear-gradient(150deg, #234931 0%, #1B3A26 55%, #16301F 100%)',
    yearCardFallback: '#1B3A26',
    yearCardShadow:
      '10px 10px 22px rgba(0,0,0,0.6), -8px -8px 18px rgba(101,152,113,0.12), inset 0 1px 0 rgba(164,227,166,0.12)',
    yearParticles: ['#A4E3A6', '#FBD9BC', '#EFF6E2'],
    yearLabel: '#9FB89C',
    yearBadgeText: '#0F1E14',
    yearBadgeBackground: '#A4E3A6',
    yearPrice: '#EFF6E2',
    yearPer: '#93A78F',
    yearMeta: '#9FB89C',
    bubbleText: '#A4E3A6',
    bubbleBackground: 'rgba(164,227,166,0.13)',
    bubbleShadow: 'inset 3px 3px 7px rgba(0,0,0,0.4)',
    checkStroke: '#A4E3A6',
    featureText: '#B9CCB2',
    subscribeText: '#A4E3A6',
    subscribeBackground: '#142519',
    subscribeShadow:
      'inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.08)',
    monthRing: '#A4E3A6',
    yearRing: '#A4E3A6',
  },
}
