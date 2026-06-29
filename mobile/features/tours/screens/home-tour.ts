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
  // Two halves of the MonthSummaryCard, highlighted as separate
  // steps so the user understands each side does its own thing.
  variables: {
    order: 3,
    get text() {
      return i18n.t('states:tour.home.variables')
    },
  },
  fixed: {
    order: 4,
    get text() {
      return i18n.t('states:tour.home.fixed')
    },
  },
  // Conditional — only registers if MetaCard renders (savings goal
  // configured). When MetaEmptyCard renders instead, this step
  // doesn't register and the tour skips it naturally.
  meta: {
    order: 5,
    get text() {
      return i18n.t('states:tour.home.meta')
    },
  },
  // Garden streak — habit tracker just above the activity feed.
  // Conditional like `meta`: only registers when StreakWeekWidget
  // actually renders (i.e. there's garden data), otherwise it's
  // skipped naturally.
  streak: {
    order: 6,
    get text() {
      return i18n.t('states:tour.home.streak')
    },
  },
  // Activity feed.
  activity: {
    order: 7,
    get text() {
      return i18n.t('states:tour.home.activity')
    },
  },
  // Last: bottom chrome — FAB long-press hint.
  fab: {
    order: 8,
    get text() {
      return i18n.t('states:tour.home.fab')
    },
  },
} satisfies Record<string, TourStepCopy>
