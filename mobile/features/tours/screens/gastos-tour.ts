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
  // El filtro va antes que el calendario porque así está en pantalla desde el
  // 2026-08-12 (gobierna hero + calendario + listado, ver la nota del
  // `ListHeader` en neo-gastos-screen). El tour recorre por `order`: si no se
  // acompañaba, el paso 2 mandaba a scrollear al calendario y el 3 de vuelta
  // hacia arriba.
  filters: {
    order: 2,
    get text() {
      return i18n.t('states:tour.gastos.filters')
    },
  },
  calendar: {
    order: 3,
    get text() {
      return i18n.t('states:tour.gastos.calendar')
    },
  },
  list: {
    order: 4,
    get text() {
      return i18n.t('states:tour.gastos.list')
    },
  },
} satisfies Record<string, TourStepCopy>
