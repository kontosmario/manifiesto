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
    text: 'El resumen del mes: cuánto llevas gastado, qué categorías encabezan y tu promedio diario. Una mirada y entiendes cómo va el mes.',
  },
  streak: {
    order: 1,
    text: 'Tu racha de días registrando gastos. Cada día que cargas al menos un gasto (o marcas que no gastaste) suma un día a la llama. La racha desbloquea escudos y recompensas.',
  },
  calendar: {
    order: 2,
    text: 'El calendario del mes con tus gastos día por día. El color de cada día refleja cuánto gastaste. Toca un día para filtrar la lista y ver solo los movimientos de esa fecha.',
  },
  filters: {
    order: 3,
    text: 'Filtros rápidos por categoría. Toca un chip y la lista de abajo se ajusta al instante — útil para ver, por ejemplo, cuánto llevas en supermercado o en transporte.',
  },
  list: {
    order: 4,
    text: 'Tu lista de movimientos del mes, agrupados por día. Toca una fila para abrir el detalle, o deslízala hacia la izquierda para editarla o borrarla. La lista respeta el filtro y el día seleccionado arriba.',
  },
} as const satisfies Record<string, TourStepCopy>
