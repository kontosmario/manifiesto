import { useEffect, useMemo, useRef, useState } from 'react'
import { useFixedExpenseCategories } from '@/features/categories/use-categories'
import { useCommitmentExpenses } from '@/features/expenses/use-expenses'
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
 * Tabs del listado (2026-05-31, refinado a 3 buckets):
 *  - 'vencidos'   → overdue (cuotas ya vencidas sin pagar).
 *                   Lo MÁS urgente. Color rojo para que salte primero.
 *  - 'pendientes' → pending (cuotas del ciclo activo que aún no vencieron).
 *  - 'pagados'    → paid (pago directo en cycle + cycle covered by
 *                   prior payment, ej. trimestrales recién pagados).
 *
 * Historia:
 *   - v1: 'todos' (poco scannable) y 'zombis' (deprecated). Removidos.
 *   - v2: 3 buckets (Pendientes+Vencidos juntos). Separamos en v3.
 *   - v3: 4 buckets (Vencidos / Pendientes / Pagados / Próximos).
 *   - v4 (HOY): 3 buckets. "Próximos" (future) era casi siempre vacía
 *     post-cycle-coverage fix — la info de fijos programados sin pagar
 *     pasa a un BANNER contextual arriba del listado en lugar de tab
 *     dedicada. Patrón típico de apps Bills/PocketGuard. Decisión
 *     después de comparable analysis.
 */
export type FijosTab = 'vencidos' | 'pendientes' | 'pagados'

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
  // El default se inicializa a 'pendientes' pero el effect abajo lo
  // promueve a 'vencidos' si hay vencidos al cargar — para que el
  // primer paint muestre lo más urgente (mora arrastrada).
  const [tab, setTab] = useState<FijosTab>('pendientes')
  const userInteractedWithTabsRef = useRef(false)
  const setTabUserDriven = useMemo(
    () => (next: FijosTab) => {
      userInteractedWithTabsRef.current = true
      setTab(next)
    },
    [],
  )

  const categoriesQuery = useFixedExpenseCategories(familyId)
  const fixedExpensesQuery = useFixedExpenses(familyId)
  const financeQuery = useFamilyFinance(familyId)
  // Histórico de pagos de fijos sin pasar por el cap del `home_snapshot`
  // — necesario para que el badge de variación de precio compare contra
  // el pago anterior real, incluso cuando la familia tiene mucho gasto
  // variable en el medio.
  const commitmentExpensesQuery = useCommitmentExpenses(familyId)

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

  const monthlyIncomeForSummary = financeQuery.data?.monthly_income ?? 0
  const summary = useMemo(() => {
    if (items.length === 0) return DEFAULT_SUMMARY
    return summarizeFijos({
      items,
      paymentsThisCycle: paymentsQuery.data ?? [],
      commitmentExpenses: commitmentExpensesQuery.data ?? [],
      categoriesById,
      today,
      cycleStart: cycle.start,
      cycleEnd: cycle.end,
      cycleDays: cycle.days,
      monthlyIncome: monthlyIncomeForSummary,
    })
  }, [
    items,
    paymentsQuery.data,
    commitmentExpensesQuery.data,
    categoriesById,
    today,
    cycle.start,
    cycle.end,
    cycle.days,
    monthlyIncomeForSummary,
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
    // 3 buckets (2026-05-31 v4):
    //   vencidos   → overdue
    //   pendientes → pending
    //   pagados    → paid (incluye paid-via-coverage)
    // Future items NO van a ningún tab — se muestran en un banner
    // contextual arriba del listado (FijosScheduledBanner).
    if (tab === 'vencidos') return summary.overdueItems
    if (tab === 'pagados') return summary.paidItems
    return summary.pendingItems
  }, [tab, summary])

  // Auto-promote a 'vencidos' SOLO la primera vez que el data está
  // cargado y hay vencidos. Si el user ya tocó alguna tab, respetamos
  // su selección. Esto evita "secuestro" del tab cuando el user fue a
  // 'pagados' y luego un refetch trae un nuevo vencido.
  useEffect(() => {
    if (userInteractedWithTabsRef.current) return
    if (fixedExpensesQuery.isLoading) return
    if (summary.overdueItems.length > 0 && tab !== 'vencidos') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- promote initial tab once data loads
      setTab('vencidos')
    }
  }, [
    fixedExpensesQuery.isLoading,
    summary.overdueItems.length,
    tab,
  ])

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
    setTab: setTabUserDriven,
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
