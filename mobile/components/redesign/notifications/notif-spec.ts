/**
 * Tokens de la vista Notificaciones (Turno 6) — valores LITERALES de
 * design/rediseno-2026-07/screens/7a.html (claro) · 7ao.html (oscuro) ·
 * 7b/7bo (empty state). Réplica bajo gate de aprobación: no "mejorar"
 * valores. Mismo criterio que auth-spec / onb-spec / plan-spec.
 *
 * DESVÍO DE COLOR (owner 2026-07-18): en claro cada card tiene su tile de
 * icono con color pastel distinto por tipo. El mockup oscuro los ponía al
 * ~13% de opacidad (pastelDark) → se lavaban a un tinte casi monocromo.
 * Se pasan a `pastelDarkSolid` (skill color-palette: matiz preservado, L
 * de dark, S subida) para que en oscuro también tengan color distinto —
 * mismo tratamiento que la grilla de avatares de 5b.
 */
import { pastelDarkSolid } from '@/theme/neo-tokens'

export type NotifMode = 'light' | 'dark'

export interface NotifSpec {
  bg: string
  // Chrome (barra de estado / home indicator) — color del mockup.
  chrome: string
  // Header: círculo back (raised) + título.
  backGradientCss: string | undefined
  backBackground: string
  backShadow: string
  backStroke: string
  title: string
  // Chip "N pendientes" (hundido) + dot durazno + link "Marcar todas".
  chipBackground: string | undefined
  chipShadow: string
  chipDot: string
  chipText: string
  markAll: string
  // Card raised (icono pastel + textos + check hundido).
  cardGradientCss: string
  cardFallback: string
  cardShadow: string
  cardTitle: string
  cardTime: string
  cardBody: string
  // Check circular hundido (36) por ítem.
  checkBackground: string | undefined
  checkShadow: string
  checkStroke: string
  // Tiles de icono por tipo (pastel claro / rgba tenue en oscuro).
  iconMorning: string // 🔥 resumen matutino
  iconDayClose: string // 🌙 cierre del día
  iconMidday: string // ☀️ medio día
  iconGarden: string // 🌱 Brot seed (jardín)
  // Empty state (7b): pedestal raised + pozo hundido + copy + chip verde.
  emptyOuterGradientCss: string | undefined
  emptyOuterBackground: string
  emptyOuterShadow: string
  emptyWellBackground: string | undefined
  emptyWellShadow: string
  emptyTitle: string
  emptyBody: string
  emptyChipDot: string
}

export const NOTIF_SPEC: Record<NotifMode, NotifSpec> = {
  light: {
    bg: '#E9EBE0',
    chrome: '#24382A',
    backGradientCss: undefined,
    backBackground: '#E9EBE0',
    backShadow: '6px 6px 12px rgba(151,160,136,0.4), -6px -6px 12px rgba(255,255,255,0.9)',
    backStroke: '#24382A',
    title: '#24382A',
    chipBackground: undefined,
    chipShadow: 'inset 3px 3px 7px rgba(151,160,136,0.38), inset -3px -3px 7px rgba(255,255,255,0.92)',
    chipDot: '#D97E4F',
    chipText: '#3E5A44',
    markAll: '#2E7C39',
    cardGradientCss: 'linear-gradient(145deg, #F0F2E7, #E1E4D6)',
    cardFallback: '#E8EADD',
    cardShadow: '8px 8px 18px rgba(151,160,136,0.4), -8px -8px 18px rgba(255,255,255,0.92)',
    cardTitle: '#24382A',
    cardTime: '#9AA694',
    cardBody: '#6C7B67',
    checkBackground: undefined,
    checkShadow: 'inset 3px 3px 7px rgba(151,160,136,0.38), inset -3px -3px 7px rgba(255,255,255,0.92)',
    checkStroke: '#2E7C39',
    iconMorning: '#F7E3CF',
    iconDayClose: '#E6E0F4',
    iconMidday: '#F2ECC9',
    iconGarden: '#DDEBDD',
    emptyOuterGradientCss: undefined,
    emptyOuterBackground: '#E9EBE0',
    emptyOuterShadow: '12px 12px 26px rgba(151,160,136,0.45), -12px -12px 26px rgba(255,255,255,0.95)',
    emptyWellBackground: undefined,
    emptyWellShadow: 'inset 6px 6px 13px rgba(151,160,136,0.4), inset -6px -6px 13px rgba(255,255,255,0.95)',
    emptyTitle: '#24382A',
    emptyBody: '#6C7B67',
    emptyChipDot: '#2E7C39',
  },
  dark: {
    bg: '#16271C',
    chrome: '#F1EEDD',
    backGradientCss: 'linear-gradient(145deg, #1F3527, #14241A)',
    backBackground: '#1A2D21',
    backShadow: '6px 6px 12px rgba(0,0,0,0.5), -6px -6px 12px rgba(101,152,113,0.1)',
    backStroke: '#DCE8D5',
    title: '#F1EEDD',
    chipBackground: '#142519',
    chipShadow: 'inset 3px 3px 7px rgba(0,0,0,0.5), inset -3px -3px 7px rgba(101,152,113,0.08)',
    chipDot: '#F2A87E',
    chipText: '#B9CCB2',
    markAll: '#A4E3A6',
    cardGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    cardFallback: '#1A2E20',
    cardShadow: '8px 8px 18px rgba(0,0,0,0.5), -8px -8px 18px rgba(101,152,113,0.1)',
    cardTitle: '#F1EEDD',
    cardTime: '#7C917A',
    cardBody: '#93A78F',
    checkBackground: '#142519',
    checkShadow: 'inset 3px 3px 7px rgba(0,0,0,0.5), inset -3px -3px 7px rgba(101,152,113,0.08)',
    checkStroke: '#A4E3A6',
    // Derivados de los pasteles CLAROS por avatar/tipo (matiz preservado):
    // 🔥 #F7E3CF · 🌙 #E6E0F4 · ☀️ #F2ECC9 · 🌱 #DDEBDD.
    iconMorning: pastelDarkSolid('#F7E3CF'),
    iconDayClose: pastelDarkSolid('#E6E0F4'),
    iconMidday: pastelDarkSolid('#F2ECC9'),
    iconGarden: pastelDarkSolid('#DDEBDD'),
    emptyOuterGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    emptyOuterBackground: '#182A1F',
    emptyOuterShadow: '12px 12px 26px rgba(0,0,0,0.6), -12px -12px 26px rgba(101,152,113,0.12)',
    emptyWellBackground: '#142519',
    emptyWellShadow: 'inset 6px 6px 13px rgba(0,0,0,0.5), inset -6px -6px 13px rgba(101,152,113,0.08)',
    emptyTitle: '#F1EEDD',
    emptyBody: '#93A78F',
    emptyChipDot: '#A4E3A6',
  },
}
