import i18n from '@/lib/i18n'
import { TOUR_KEYS } from '../tour-keys'
import type { TourStepCopy } from './home-tour'

export const FIJOS_TOUR = TOUR_KEYS.fijos

/**
 * Fijos tour — 4 stops. Adds the "agregar fijo" button on top of
 * the existing 3 (hero / upcoming strip / list).
 *
 * `text` vía getter para reaccionar al cambio de idioma en runtime.
 */
export const FIJOS_TOUR_STEPS = {
  hero: {
    order: 0,
    get text() {
      return i18n.t('states:tour.fijos.hero')
    },
  },
  calendar: {
    order: 1,
    get text() {
      return i18n.t('states:tour.fijos.calendar')
    },
  },
  list: {
    order: 2,
    get text() {
      return i18n.t('states:tour.fijos.list')
    },
  },
  addButton: {
    order: 3,
    get text() {
      return i18n.t('states:tour.fijos.addButton')
    },
  },
} satisfies Record<string, TourStepCopy>
