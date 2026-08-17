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
 * ORDEN 2026-08-03 (vista neo, design_handoff_control): los `order`
 * siguen el orden VERTICAL del layout nuevo — hero fusionado (hoy 0 +
 * alcanza 1 apuntan a la misma card), comparativa (vsMes 2), tendencia
 * (semana 3), hábito (patron 4), reparto (cobertura 5) y la meta/
 * alcancía al final (alcancia 6). Con los orders viejos el auto-scroll
 * del tour saltaba al fondo en el paso 2 y volvía a subir.
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
  vsMes: {
    order: 1,
    get text() {
      return i18n.t('states:tour.control.vsMes')
    },
  },
  semana: {
    order: 2,
    get text() {
      return i18n.t('states:tour.control.semana')
    },
  },
  patron: {
    order: 3,
    get text() {
      return i18n.t('states:tour.control.patron')
    },
  },
  cobertura: {
    order: 4,
    get text() {
      return i18n.t('states:tour.control.cobertura')
    },
  },
  alcancia: {
    order: 5,
    get text() {
      return i18n.t('states:tour.control.alcancia')
    },
  },
} satisfies Record<string, TourStepCopy>
