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
 */
export const GASTOS_TOUR_STEPS = {
  hero: {
    order: 0,
    text: 'El resumen del ciclo: cuánto llevás gastado y qué categorías lideran. Una mirada y entendés cómo viene el mes.',
  },
  streak: {
    order: 1,
    text: 'Tu racha de días registrando gastos. Cada día que cargás al menos uno (o marcás "no gasté") suma un día a la llama. La racha es lo que destraba escudos y premios.',
  },
  calendar: {
    order: 2,
    text: 'El calendario del mes con tus gastos por día. El color de cada día refleja cuánto gastaste; tocá un día para filtrar la lista a esa fecha y ver sólo lo de ese día.',
  },
  filters: {
    order: 3,
    text: 'Filtros rápidos por categoría. Tocá un chip y la lista de abajo se filtra al toque — útil para ver "cuánto llevo en supermercado" o "todos los gastos de transporte".',
  },
  list: {
    order: 4,
    text: 'Tu lista de movimientos del ciclo, agrupados por día. Tocá una fila para abrir el detalle, o deslizala hacia la izquierda para editar o borrar. La lista respeta el filtro y el día seleccionado arriba.',
  },
} as const satisfies Record<string, TourStepCopy>
