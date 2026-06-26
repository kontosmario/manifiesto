import i18n from '@/lib/i18n'
import { TOUR_KEYS } from '../tour-keys'
import type { TourStepCopy } from './home-tour'

export const GASTOS_TOUR = TOUR_KEYS.gastos

/**
 * Gastos tour — 5 stops. Order:
 *   0. Hero (top summary)
 *   1. Streak flame icon (header right slot)
 *   2. Calendar
 *   3. Filters
 *   4. Activity list
 *
 * `text` vía getter para reaccionar al cambio de idioma en runtime.
 */
export const GASTOS_TOUR_STEPS = {
  hero: {
    order: 0,
    get text() {
      return i18n.t('states:tour.gastos.hero')
    },
  },
  streak: {
    order: 1,
    get text() {
      return i18n.t('states:tour.gastos.streak')
    },
  },
  calendar: {
    order: 2,
    get text() {
      return i18n.t('states:tour.gastos.calendar')
    },
  },
  filters: {
    order: 3,
    get text() {
      return i18n.t('states:tour.gastos.filters')
    },
  },
  list: {
    order: 4,
    get text() {
      return i18n.t('states:tour.gastos.list')
    },
  },
} satisfies Record<string, TourStepCopy>
