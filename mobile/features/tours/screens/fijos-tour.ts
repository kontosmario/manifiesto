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
    text: 'Tus gastos fijos del mes: cuántos ya pagaste, cuánto te queda por pagar y cuándo vence cada uno. Aquí entran rentas o alquileres, suscripciones y servicios.',
  },
  calendar: {
    order: 1,
    text: 'Lo que vence pronto, en orden cronológico. Cada burbuja muestra el día y la categoría — los números en rojo marcan los que ya pasaron de fecha.',
  },
  list: {
    order: 2,
    text: 'La lista de abajo agrupa tus fijos por categoría. Toca uno para marcarlo como pagado, o deslízalo hacia la izquierda para editarlo, pausarlo o eliminarlo.',
  },
  addButton: {
    order: 3,
    text: 'Aquí agregas un fijo nuevo. Suma una renta, una suscripción o cualquier compromiso recurrente — defines cada cuánto vence y la app lo añade automáticamente al ciclo.',
  },
} as const satisfies Record<string, TourStepCopy>
