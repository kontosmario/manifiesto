import { TOUR_KEYS } from '../tour-keys'
import type { TourStepCopy } from './home-tour'

export const FIJOS_TOUR = TOUR_KEYS.fijos

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
    text: 'La lista debajo muestra cada fijo con su próximo vencimiento. Tocalo para marcarlo como pagado, o deslizá para editarlo o pausarlo.',
  },
} as const satisfies Record<string, TourStepCopy>
