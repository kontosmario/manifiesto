import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'
import type { UseFijosControllerResult } from '@/features/fijos/use-fijos-controller'
import type { HeroState } from '@/components/fijos-hero-preview/hero-states'
import type { FijoItem as FijoListItem } from '@/components/fijos-hero-preview/fijo-list-sample'

const FALLBACK_CATEGORY_COLOR = '#9FC9E4'
const MONTH_SHORT_LONG = [
  ['ene', 'Enero'],
  ['feb', 'Febrero'],
  ['mar', 'Marzo'],
  ['abr', 'Abril'],
  ['may', 'Mayo'],
  ['jun', 'Junio'],
  ['jul', 'Julio'],
  ['ago', 'Agosto'],
  ['sep', 'Septiembre'],
  ['oct', 'Octubre'],
  ['nov', 'Noviembre'],
  ['dic', 'Diciembre'],
] as const

/**
 * Adapta el resultado del `useFijosController` real al shape `HeroState`
 * que consumen los componentes de la vista completa V3. Centraliza el
 * mapping en un solo lugar — los componentes siguen usando el mock
 * `HeroState` y las dev previews siguen funcionando con HERO_STATES,
 * mientras la screen de producción usa el adapter.
 */
export function adaptControllerToHeroState(input: {
  controller: UseFijosControllerResult
  advisorSignals?: ControlAdvisorTask[]
  categoriesById: Map<string, { id: string; name: string; color: string }>
}): HeroState {
  const { controller, advisorSignals = [], categoriesById } = input
  const { summary, today } = controller

  const cycleDayIndex = Math.max(1, controller.cycleDays - summary.daysRemaining)
  const monthIdx = today.getMonth()
  const monthLong = MONTH_SHORT_LONG[monthIdx]?.[1] ?? 'Mes'
  const monthShort = MONTH_SHORT_LONG[monthIdx]?.[0]?.toUpperCase() ?? '---'
  const nextMonthIdx = (monthIdx + 1) % 12
  const monthShortNext = MONTH_SHORT_LONG[nextMonthIdx]?.[0]?.toUpperCase() ?? '---'

  // Upcoming: top 3 from summary.upcoming, mapped to the preview shape
  const upcoming = summary.upcoming.slice(0, 3).map((item) => {
    const cat = item.category_id ? categoriesById.get(item.category_id) : undefined
    return {
      id: item.id,
      name: item.name,
      days: item.computedStatus === 'overdue'
        ? -Math.min(controller.cycleDays, Math.max(1, controller.cycleDays - item.daysUntilDue))
        : item.daysUntilDue,
      amount: Number(item.amount ?? 0),
      categoryColor: cat?.color ?? FALLBACK_CATEGORY_COLOR,
      hikeDeltaPct:
        item.trendDeltaPct != null && item.trendDeltaPct >= 5
          ? item.trendDeltaPct
          : undefined,
      isOverdue: item.computedStatus === 'overdue',
    }
  })

  // Items completos para FullList (paid + pending + overdue)
  const allItems = [
    ...summary.paidItems,
    ...summary.pendingItems,
    ...summary.overdueItems,
  ]
  const itemsOverride: FijoListItem[] = allItems.map((item) => {
    const cat = item.category_id ? categoriesById.get(item.category_id) : undefined
    return {
      id: item.id,
      name: item.name,
      category: cat?.name ?? 'Sin categoría',
      categoryColor: cat?.color ?? FALLBACK_CATEGORY_COLOR,
      amount: Number(item.amount ?? 0),
      dayOfMonth: item.dayOfMonth,
      // En FijoItem del aggregate: daysUntilDue ya wrap-aware. Para
      // overdue, lo expresamos negativo (cuántos días hace que venció)
      // para consistencia con el shape del FijoListItem mock.
      daysUntil:
        item.computedStatus === 'overdue'
          ? -Math.max(1, controller.cycleDays - item.daysUntilDue)
          : item.daysUntilDue,
      status: item.computedStatus,
      hikeDeltaPct:
        item.trendDeltaPct != null && item.trendDeltaPct >= 5
          ? item.trendDeltaPct
          : undefined,
    }
  })

  // Hikes: del summary aggregate, ya filtradas a +5%
  const hikes = summary.hikes.map((h) => ({
    id: `hike-${h.fixedExpenseId}`,
    name: h.name,
    previousPrice: h.previousPrice,
    currentPrice: h.currentPrice,
    deltaPct: h.deltaPct,
    categoryColor: h.category?.color ?? FALLBACK_CATEGORY_COLOR,
  }))

  // Signals: advisor signals filtradas al dominio fijos
  const signals = advisorSignals
    .filter((s) => s.id === 'stress-week' || s.id === 'fijos-ratio')
    .map((s) => ({
      id: s.id,
      kind: (s.id === 'stress-week' ? 'stress-week' : 'fijos-ratio') as
        | 'stress-week'
        | 'fijos-ratio',
      title: s.title,
      body: s.body,
      urgency: (s.urgency === 'alta' ? 'alta' : 'media') as 'alta' | 'media' | 'baja',
    }))

  // nextItem: primer upcoming si existe
  const firstUpcoming = upcoming.find((u) => !u.isOverdue) ?? upcoming[0]
  const nextItem = firstUpcoming
    ? {
        name: firstUpcoming.name,
        days: Math.max(0, firstUpcoming.days),
        amount: firstUpcoming.amount,
        dayOfWeek: dayOfWeekLabel(today, firstUpcoming.days),
      }
    : null

  const isEmpty = allItems.length === 0
  const isAllPaid = !isEmpty && summary.pendingItems.length === 0 && summary.overdueItems.length === 0

  return {
    id: 'live',
    label: 'Live',
    description: 'Estado real del usuario',
    cycleLabel: controller.cycleLabel,
    monthLong,
    monthShort,
    monthShortNext,
    daysRemaining: summary.daysRemaining,
    cycleDays: controller.cycleDays,
    todayDay: summary.todayDay,
    cycleDayIndex,
    totalFijos: summary.total,
    montoPagado: summary.paidAmount,
    montoPendiente: summary.pendingAmount,
    montoVencido: summary.overdueAmount,
    montoPorPagarTotal: summary.pendingAmount + summary.overdueAmount,
    cantidadFijos: allItems.length,
    cantidadPagados: summary.paidItems.length,
    cantidadPendientes: summary.pendingItems.length,
    cantidadVencidos: summary.overdueItems.length,
    cantidadPorPagarTotal: summary.pendingItems.length + summary.overdueItems.length,
    dineroLibre: controller.freeAfterFijos,
    pctSueldo: controller.pctOfIncome,
    paidPct: summary.paidPct,
    nextItem,
    upcoming,
    alerts: {
      hikes,
      signals,
    },
    isEmpty,
    isAllPaid,
    // Hack: stashea items reales en el state. FullListLive ya soporta
    // este override (ver actualización en fijo-list-sample.ts).
    itemsOverride,
  } as HeroState & { itemsOverride: FijoListItem[] }
}

function dayOfWeekLabel(today: Date, daysAhead: number): string {
  const NAMES = [
    'domingo',
    'lunes',
    'martes',
    'miércoles',
    'jueves',
    'viernes',
    'sábado',
  ]
  const target = new Date(today)
  target.setDate(target.getDate() + Math.max(0, daysAhead))
  return NAMES[target.getDay()] ?? ''
}
