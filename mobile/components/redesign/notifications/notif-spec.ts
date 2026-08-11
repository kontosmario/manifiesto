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
 *
 * FUERA DEL MOCKUP: 7a/7b no dibujan la pill de severidad (es un arrastre
 * semántico del feed vigente) ni contemplan los Android que descartan la
 * sombra inset. Los tokens `pill*` y `hairline` se derivan del vocabulario
 * neo, no del markup — por eso llevan su propia justificación.
 */
import type { NotificationSeverity } from '@/features/notifications/use-notifications'
import i18n from '@/lib/i18n'
import { pastelDarkSolid } from '@/theme/neo-tokens'
import type { SeverityPill } from '@/utils/notifications'

export type NotifMode = 'light' | 'dark'

/** Par tinta/fondo de la pill de severidad, ya resuelto para el tema. */
interface NotifSeverityPill {
  surface: string
  ink: string
}

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
  /**
   * Línea de reemplazo para los pozos (chip / check / pozo del empty) cuando
   * el device no dibuja `boxShadow` inset: sin ella esos tres elementos —uno
   * de ellos el target del único gesto de la vista— se leen SOLO por su
   * sombra y desaparecen. Mismo valor que `neo.sheetDivider`.
   */
  hairline: string
  /** Pill de severidad de la card. */
  pillSuccess: NotifSeverityPill
  pillWarning: NotifSeverityPill
  pillAlert: NotifSeverityPill
}

export const NOTIF_SPEC: Record<NotifMode, NotifSpec> = {
  light: {
    bg: '#DCDFCD',
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
    cardBody: '#54644F',
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
    emptyBody: '#54644F',
    emptyChipDot: '#2E7C39',
    hairline: 'rgba(151,160,136,0.25)',
    // La pill es texto de 10px: en claro los tintes alpha del vocabulario
    // dejan el par por debajo de AA (el verde de material da 3.76:1, el clay
    // 3.11:1), así que el fondo es el pastel OPACO de la misma familia y la
    // tinta el escalón profundo. `alert` invierte —fill clay + crema— porque
    // ningún clay legible sobre pastel llegaba a 4.5:1, y de paso escala.
    pillSuccess: { surface: '#DDEBDD', ink: '#1F5429' },
    pillWarning: { surface: '#F7E3CF', ink: '#9A421F' },
    pillAlert: { surface: '#A84A2F', ink: '#F5F2E1' },
  },
  dark: {
    bg: '#0F1A13',
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
    hairline: 'rgba(101,152,113,0.18)',
    pillSuccess: { surface: 'rgba(164,227,166,0.16)', ink: '#A4E3A6' },
    pillWarning: { surface: 'rgba(242,168,126,0.16)', ink: '#F2A87E' },
    pillAlert: { surface: '#E08765', ink: '#16271C' },
  },
}

/**
 * Pill de severidad con el vocabulario del rediseño. Reemplaza a
 * `pillForSeverity` (paleta de estado PRE-rediseño) dentro de la vista neo:
 * los matices eran casi-iguales-pero-distintos a los del sistema y ninguno
 * de los pares claros llegaba a AA.
 */
export function pillForSeverityNeo(
  severity: NotificationSeverity,
  mode: NotifMode,
): SeverityPill | null {
  const s = NOTIF_SPEC[mode]
  switch (severity) {
    case 'success':
      return { ...s.pillSuccess, label: i18n.t('common:severity.success') }
    case 'warning':
      return { ...s.pillWarning, label: i18n.t('common:severity.warning') }
    case 'alert':
      return { ...s.pillAlert, label: i18n.t('common:severity.alert') }
    default:
      return null
  }
}
