import type { HeroState } from './hero-states'
import { formatMoney } from '@/utils/money'

export type TabId = 'todos' | 'pendientes' | 'pagados' | 'zombis'

export interface TabBucket {
  id: TabId
  label: string
  count: number
  /** Monto $ del bucket. Solo se muestra en algunas variantes. */
  amount: number
}

export function buildTabBuckets(state: HeroState): TabBucket[] {
  return [
    {
      id: 'todos',
      label: 'Todos',
      count: state.cantidadFijos,
      amount: state.totalFijos,
    },
    {
      id: 'pendientes',
      label: 'Pendientes',
      count: state.cantidadPorPagarTotal,
      amount: state.montoPorPagarTotal,
    },
    {
      id: 'pagados',
      label: 'Pagados',
      count: state.cantidadPagados,
      amount: state.montoPagado,
    },
    // 'zombis' es bucket legacy — la deducción zombi ahora vive en el
    // asistente. Lo dejamos a 0 para mantener compat con la API del
    // controller.
    { id: 'zombis', label: 'Zombi', count: 0, amount: 0 },
  ]
}

export function formatTabAmount(amount: number): string {
  return formatMoney(amount)
}
