import i18n from '@/lib/i18n'
import { TOUR_KEYS } from '../tour-keys'
import type { TourStepCopy } from './home-tour'

export const CONTROL_TOUR = TOUR_KEYS.control

/**
 * Control tour — 8 stops covering every analytics card top-to-bottom
 * so the user understands what each one tells them.
 *
 * `text` vía getter para reaccionar al cambio de idioma en runtime.
 */
export const CONTROL_TOUR_STEPS = {
  hoy: {
    order: 0,
    get text() {
      return i18n.t('states:tour.control.hoy')
    },
  },
  asesor: {
    order: 1,
    get text() {
      return i18n.t('states:tour.control.asesor')
    },
  },
  alcanza: {
    order: 2,
    get text() {
      return i18n.t('states:tour.control.alcanza')
    },
  },
  alcancia: {
    order: 3,
    get text() {
      return i18n.t('states:tour.control.alcancia')
    },
  },
  semana: {
    order: 4,
    get text() {
      return i18n.t('states:tour.control.semana')
    },
  },
  vsMes: {
    order: 5,
    get text() {
      return i18n.t('states:tour.control.vsMes')
    },
  },
  patron: {
    order: 6,
    get text() {
      return i18n.t('states:tour.control.patron')
    },
  },
  cobertura: {
    order: 7,
    get text() {
      return i18n.t('states:tour.control.cobertura')
    },
  },
} satisfies Record<string, TourStepCopy>
