import { TOUR_KEYS } from '../tour-keys'
import type { TourStepCopy } from './home-tour'

export const FIJOS_TOUR = TOUR_KEYS.fijos

/**
 * Fijos tour — 4 stops. Adds the "agregar fijo" button on top of
 * the existing 3 (hero / upcoming strip / list).
 */
export const FIJOS_TOUR_STEPS = {
  hero: {
    order: 0,
    text: 'Tus gastos fijos del mes: cuántos pagaste, cuánto te queda por pagar y cuándo vence cada uno. Pensá en alquiler, suscripciones, servicios.',
  },
  calendar: {
    order: 1,
    text: 'Lo que vence pronto, en orden cronológico. Cada burbuja te muestra el día y la categoría — si ves números rojos, son los que ya pasaron de fecha.',
  },
  list: {
    order: 2,
    text: 'La lista debajo agrupa los fijos por categoría. Tocá uno para marcarlo como pagado, o deslizá para editarlo, pausarlo o eliminarlo.',
  },
  addButton: {
    order: 3,
    text: 'Acá agregás un fijo nuevo. Sumá un alquiler, una suscripción o cualquier compromiso recurrente — definís cada cuánto vence y la app lo mete en el ciclo automáticamente.',
  },
} as const satisfies Record<string, TourStepCopy>
