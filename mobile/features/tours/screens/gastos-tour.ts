import { TOUR_KEYS } from '../tour-keys'
import type { TourStepCopy } from './home-tour'

export const GASTOS_TOUR = TOUR_KEYS.gastos

export const GASTOS_TOUR_STEPS = {
  hero: {
    order: 0,
    text: 'El resumen del ciclo: cuánto llevás gastado y la racha de días que sumás registrando gastos. La racha es lo que destraba escudos y premios.',
  },
  calendar: {
    order: 1,
    text: 'El calendario del mes con tus gastos por día. Tocá un día para filtrar la lista a esa fecha — útil para revisar un día puntual.',
  },
  filters: {
    order: 2,
    text: 'Filtros rápidos por categoría, fecha o miembro de la familia. Cada gasto en la lista de abajo se puede deslizar hacia la izquierda para editarlo o borrarlo.',
  },
} as const satisfies Record<string, TourStepCopy>
