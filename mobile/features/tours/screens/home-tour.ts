import { TOUR_KEYS } from '../tour-keys'

export const HOME_TOUR = TOUR_KEYS.home

export interface TourStepCopy {
  order: number
  text: string
}

/**
 * Home tour — 3 stops covering the bones of the screen, in
 * top-to-bottom reading order. The FAB introduction is folded into
 * the closing step's copy rather than highlighted directly: the FAB
 * lives in shared tab-bar chrome and wrapping it from a screen tour
 * couples this feature to the tab-button's render path.
 */
export const HOME_TOUR_STEPS = {
  payday: {
    order: 0,
    text: 'Acá vive tu familia y los días que faltan para tu próximo cobro. Tap en la cápsula te confirma que ya cobraste y arranca un ciclo nuevo.',
  },
  hero: {
    order: 1,
    text: 'Tu meta de ahorro: cuánto llevás, cuánto falta y a qué ritmo vas. Si todavía no configuraste tu ingreso mensual, vas a ver el atajo para hacerlo desde acá.',
  },
  monthSummary: {
    order: 2,
    text: 'El balance del ciclo en un solo número: ingresos menos fijos menos gastos. Para sumar un gasto rápido, usá el botón + del centro de la barra inferior — mantenelo apretado para ver más opciones.',
  },
} as const satisfies Record<string, TourStepCopy>
