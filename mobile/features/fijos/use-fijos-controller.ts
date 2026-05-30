import { useMemo, useState } from 'react'
import { useFixedExpenseCategories } from '@/features/categories/use-categories'
import { useExpenses } from '@/features/expenses/use-expenses'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { useFixedExpenses } from '@/features/fixed-expenses/use-fixed-expenses'
import { useFixedExpensePayments } from '@/features/fixed-expenses/use-fixed-expense-payments'
import {
  groupFijosByCategory,
  summarizeFijos,
  type FijoCategoryGroup,
  type FijoItem,
  type FijosCycleSummary,
} from '@/features/fijos/fijos-aggregates.model'
import { usePayCycle } from '@/hooks/use-pay-cycle'

/**
 * Tabs simplificadas (2026-05-30): el listado divide los fijos en lo
 * accionable este ciclo ("Pendientes" = `pending + overdue/mora`) y
 * los del ciclo cerrado/futuro ("Pagados / Próximos" = `paid +
 * future`). Eliminamos "Todos" (poco scannable) y "Zombi" (deprecada,
 * ya no se computa). Migration nota: el setTab default arranca en
 * `'pendientes'` para que el primer paint sea siempre el listado
 * útil del ciclo activo.
 */
export type FijosTab = 'pendientes' | 'pagados'

export interface UseFijosControllerResult {
  isLoading: boolean
  error: unknown
  summary: FijosCycleSummary
  allItems: FijoItem[]
  filteredItems: FijoItem[]
  groups: FijoCategoryGroup[]
  tab: FijosTab
  setTab: (tab: FijosTab) => void
  monthlyIncome: number
  freeAfterFijos: number
  pctOfIncome: number
  today: Date
  cycleStart: Date
  cycleEnd: Date
  cycleDays: number
  cycleLabel: string
}

const DEFAULT_SUMMARY: FijosCycleSummary = {
  total: 0,
  paidAmount: 0,
  pendingAmount: 0,
  overdueAmount: 0,
  paidPct: 0,
  pendingPct: 0,
  overduePct: 0,
  paidItems: [],
  pendingItems: [],
  overdueItems: [],
  futureItems: [],
  upcoming: [],
  zombies: [],
  hikes: [],
  daysToNextPayment: null,
  todayDay: 1,
  cycleDays: 30,
  daysRemaining: 30,
}

const MONTH_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

export function useFijosController(familyId: string): UseFijosControllerResult {
  const { cycle, today } = usePayCycle(familyId)
  const [tab, setTab] = useState<FijosTab>('pendientes')

  const categoriesQuery = useFixedExpenseCategories(familyId)
  const fixedExpensesQuery = useFixedExpenses(familyId)
  const financeQuery = useFamilyFinance(familyId)
  const expensesQuery = useExpenses(familyId)

  const itemsData = fixedExpensesQuery.data
  const items = useMemo(() => itemsData ?? [], [itemsData])
  const fixedExpenseIds = useMemo(() => items.map((i) => i.id), [items])
  const paymentsQuery = useFixedExpensePayments({
    familyId,
    fixedExpenseIds,
    cycleStart: cycle.start,
    cycleEnd: cycle.end,
  })

  const categoriesById = useMemo(() => {
    const m = new Map<string, { id: string; name: string; color: string }>()
    for (const c of categoriesQuery.data ?? []) {
      m.set(c.id, { id: c.id, name: c.name, color: c.color })
    }
    return m
  }, [categoriesQuery.data])

  const summary = useMemo(() => {
    if (items.length === 0) return DEFAULT_SUMMARY
    return summarizeFijos({
      items,
      paymentsThisCycle: paymentsQuery.data ?? [],
      commitmentExpenses: expensesQuery.data ?? [],
      categoriesById,
      today,
      cycleStart: cycle.start,
      cycleEnd: cycle.end,
      cycleDays: cycle.days,
    })
  }, [
    items,
    paymentsQuery.data,
    expensesQuery.data,
    categoriesById,
    today,
    cycle.start,
    cycle.end,
    cycle.days,
  ])

  // `allItems` ahora incluye los `future` para que pantallas que listan
  // el catálogo completo (ej: AsesorFijos) sigan viéndolos. El filtrado
  // por tab los redirige al tab "Pagados / Próximos".
  const allItems = useMemo(
    () => [
      ...summary.paidItems,
      ...summary.pendingItems,
      ...summary.overdueItems,
      ...summary.futureItems,
    ],
    [
      summary.paidItems,
      summary.pendingItems,
      summary.overdueItems,
      summary.futureItems,
    ],
  )

  const filteredItems = useMemo(() => {
    // "Pendientes" = lo accionable este ciclo (pending del ciclo + mora
    // arrastrada de ciclos previos). "Pagados / Próximos" = lo cerrado
    // del ciclo + los que no tocan (típicamente trimestrales/anuales
    // recientemente pagados). Antes había "Todos" y "Zombis";
    // eliminados (2026-05-30).
    if (tab === 'pagados') {
      return [...summary.paidItems, ...summary.futureItems]
    }
    return [...summary.pendingItems, ...summary.overdueItems]
  }, [tab, summary])

  const categories = useMemo(
    () =>
      (categoriesQuery.data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
      })),
    [categoriesQuery.data],
  )

  const groups = useMemo(
    () => groupFijosByCategory({ items: filteredItems, categories }),
    [filteredItems, categories],
  )

  const monthlyIncome = financeQuery.data?.monthly_income ?? 0
  const savingsGoal = Math.max(0, financeQuery.data?.savings_goal ?? 0)
  // "Dinero libre este mes" es lo que queda DESPUÉS de que el usuario
  // pagó sus fijos Y reservó lo que tenía planeado ahorrar — la
  // misma fórmula canónica que usan Control/Home/Daily Budget Engine
  // para el cupo diario:
  //   libreMes = sueldo − fijos − ahorro
  // Antes solo se restaban fijos, así que con ahorro configurado y
  // sin fijos cargados, el hero mostraba el sueldo completo como
  // "libre" — sobre-prometía.
  const freeAfterFijos = Math.max(
    0,
    monthlyIncome - summary.total - savingsGoal,
  )
  const pctOfIncome =
    monthlyIncome > 0 ? Math.round((summary.total / monthlyIncome) * 100) : 0

  const cycleLabel = useMemo(() => {
    const start = cycle.start
    const end = cycle.end
    return `${start.getDate()} ${MONTH_SHORT[start.getMonth()]} → ${end.getDate()} ${MONTH_SHORT[end.getMonth()]}`
  }, [cycle.start, cycle.end])

  return {
    isLoading:
      fixedExpensesQuery.isLoading ||
      categoriesQuery.isLoading ||
      financeQuery.isLoading,
    error: fixedExpensesQuery.error ?? categoriesQuery.error ?? financeQuery.error ?? null,
    summary,
    allItems,
    filteredItems,
    groups,
    tab,
    setTab,
    monthlyIncome,
    freeAfterFijos,
    pctOfIncome,
    today,
    cycleStart: cycle.start,
    cycleEnd: cycle.end,
    cycleDays: cycle.days,
    cycleLabel,
  }
}
