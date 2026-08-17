import i18n from '@/lib/i18n'
import { TOUR_KEYS } from '../tour-keys'

export const HOME_TOUR = TOUR_KEYS.home

export interface TourStepCopy {
  order: number
  text: string
}

/**
 * Home tour — 9 stops covering the bones of the screen, in
 * top-to-bottom reading order with the FAB and header chrome
 * bracketing the content. The order field is the global order in
 * the tour; consumers reference these by name.
 *
 * `text` se resuelve vía getter para que el copy reaccione al cambio de
 * idioma en runtime (i18n.t se evalúa al leer, no al cargar el módulo).
 */
export const HOME_TOUR_STEPS = {
  // Top: chrome.
  headerActions: {
    order: 0,
    get text() {
      return i18n.t('states:tour.home.headerActions')
    },
  },
  // Middle: family + cycle context.
  familyStrip: {
    order: 1,
    get text() {
      return i18n.t('states:tour.home.familyStrip')
    },
  },
  // Hero card: the savings goal at-a-glance.
  hero: {
    order: 2,
    get text() {
      return i18n.t('states:tour.home.hero')
    },
  },
  // UN SOLO paso para la card de resumen del ciclo. Antes eran dos
  // (`variables` y `fixed`) montados como TourTarget ANIDADOS sobre la MISMA
  // card: los dos median el mismo rect, el resaltado no se movia al pasar de
  // uno a otro y se leia como que el tour se habia colgado. El rediseno
  // fusiono las dos mitades en una card y el tour ahora lo acompana.
  cycleSummary: {
    order: 3,
    get text() {
      return i18n.t('states:tour.home.cycleSummary')
    },
  },
  // Meta de ahorro. Se registra SIEMPRE — con meta configurada y sin ella
  // (pedido del owner 2026-08-17). Antes era condicional a que rindiera la
  // card CON meta, así que a quien no tenía ninguna el tour le saltaba el
  // paso: nadie le explicaba para qué sirve una meta justo a quien todavía
  // no la tiene. El paso es UNO solo; el copy tiene dos variantes y la elige
  // la screen: `tour.home.meta` (con meta) y `tour.home.metaEmpty` (sin).
  meta: {
    order: 4,
    get text() {
      return i18n.t('states:tour.home.meta')
    },
  },
  // Garden streak — habit tracker just above the activity feed.
  // Conditional like `meta`: only registers when StreakWeekWidget
  // actually renders (i.e. there's garden data), otherwise it's
  // skipped naturally.
  streak: {
    order: 5,
    get text() {
      return i18n.t('states:tour.home.streak')
    },
  },
  // Activity feed.
  activity: {
    order: 6,
    get text() {
      return i18n.t('states:tour.home.activity')
    },
  },
  // Last: bottom chrome — FAB long-press hint.
  fab: {
    order: 7,
    get text() {
      return i18n.t('states:tour.home.fab')
    },
  },
} satisfies Record<string, TourStepCopy>
