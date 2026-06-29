import i18n from '@/lib/i18n'
import { TOUR_KEYS } from '../tour-keys'
import type { TourStepCopy } from './home-tour'

export const CONTROL_TOUR = TOUR_KEYS.control

/**
 * Control tour — 7 stops covering every analytics card top-to-bottom
 * so the user understands what each one tells them.
 *
 * (El paso `asesor` se removió: la ControlV2AsesorCard ya no existe —
 * las señales del asesor se movieron al ícono de Home. No re-agregar
 * sin una card en Control que registre el target.)
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
  alcanza: {
    order: 1,
    get text() {
      return i18n.t('states:tour.control.alcanza')
    },
  },
  alcancia: {
    order: 2,
    get text() {
      return i18n.t('states:tour.control.alcancia')
    },
  },
  semana: {
    order: 3,
    get text() {
      return i18n.t('states:tour.control.semana')
    },
  },
  vsMes: {
    order: 4,
    get text() {
      return i18n.t('states:tour.control.vsMes')
    },
  },
  patron: {
    order: 5,
    get text() {
      return i18n.t('states:tour.control.patron')
    },
  },
  cobertura: {
    order: 6,
    get text() {
      return i18n.t('states:tour.control.cobertura')
    },
  },
} satisfies Record<string, TourStepCopy>
