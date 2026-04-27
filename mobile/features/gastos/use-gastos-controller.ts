import { useMemo, useState } from 'react'
import { useCategories } from '@/features/categories/use-categories'
import { useExpenses, type Expense } from '@/features/expenses/use-expenses'
import {
  computeAverageDailySpend,
  computeCategoryWeights,
  computeDailySpend,
  computeGastosDayMoods,
  computeRecentDailyBars,
  computeRegistrationStreak,
  groupGastosByDay,
  type CategoryLite,
  type CategoryWeightRow,
  type GastosDayMood,
  type GastosGroup,
} from '@/features/gastos/gastos-aggregates.model'
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'

export type GastosDateRange =
  | 'all'
  | 'today'
  | 'last-7'
  | 'first-3-days'
  | 'last-3-days'
  | 'nights'

export interface GastosSmartFilter {
  /** Min price filter (>=) — 0 or undefined means no min. */
  priceMin?: number
  /** Max price filter (<) — undefined means no max. */
  priceMax?: number
  /** Semantic date range — 'all' (default) applies no date filter. */
  dateRange?: GastosDateRange
  /** Highlight a specific expense id without filtering anything out. */
  focusExpenseId?: string
}

export interface UseGastosControllerOptions {
  /** Seed initial filter from route params (Asistente deep-links). */
  initialCategoryId?: string | null
  initialSmartFilter?: GastosSmartFilter
}

export interface UseGastosControllerResult {
  // raw
  expenses: Expense[]
  categoriesById: Map<string, CategoryLite>
  isLoading: boolean
  error: unknown
  // filter state
  selectedCategoryId: string | null
  setSelectedCategoryId: (id: string | null) => void
  selectedDay: number | null
  setSelectedDay: (day: number | null) => void
  smartFilter: GastosSmartFilter
  setSmartFilter: (next: GastosSmartFilter) => void
  clearSmartFilter: () => void
  // filtered result
  filteredExpenses: Expense[]
  filteredTotal: number
  summaryChip: string
  // aggregates
  topCategories: CategoryWeightRow[]
  dayMoods: Record<number, GastosDayMood>
  dailySpend: ReturnType<typeof computeDailySpend>
  averageDaily: number
  recentDailyBars: number[]
  registrationStreak: number
  groups: GastosGroup[]
  // cycle context
  today: Date
  cycleStart: Date
  cycleEnd: Date
  cycleDays: number
  /** Short label for the cycle, e.g. "20 abr → 20 may". */
  cycleLabel: string
  // actions
  clearDay: () => void
  clearAll: () => void
}

const MONTH_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

export function useGastosController(
  familyId: string,
  options: UseGastosControllerOptions = {},
): UseGastosControllerResult {
  const { cycle, today } = usePayCycle(familyId)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    options.initialCategoryId ?? null,
  )
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [smartFilter, setSmartFilter] = useState<GastosSmartFilter>(
    options.initialSmartFilter ?? {},
  )
  const clearSmartFilter = () => setSmartFilter({})

  const categoriesQuery = useCategories(familyId)
  const expensesQuery = useExpenses(familyId)
  const dashboard = useFamilyDashboard(familyId)

  // "Gastos" en el modelo del usuario = movimientos manuales del
  // flujo "Agregar gasto". Las filas con `commitment_id` son pagos
  // automáticos de fijos y NO deben aparecer ni sumar acá. Filtramos
  // a la entrada para que toda la cascada (cycleExpenses, totales,
  // weights, mood, streak, groups) reciba solo gastos variables.
  const allExpenses = expensesQuery.data ?? []
  const expenses = useMemo(
    () => allExpenses.filter((e) => !e.commitment_id),
    [allExpenses],
  )
  const categories: CategoryLite[] = (categoriesQuery.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
  }))
  const categoriesById = useMemo(() => {
    const m = new Map<string, CategoryLite>()
    for (const c of categories) m.set(c.id, c)
    return m
  }, [categories])

  const cycleStart = cycle.start
  const cycleEnd = cycle.end
  const cycleDays = cycle.days
  const cycleStartMs = cycleStart.getTime()
  const cycleEndMs = cycleEnd.getTime()

  const cycleLabel = useMemo(() => {
    const startLabel = `${cycleStart.getDate()} ${MONTH_SHORT[cycleStart.getMonth()]}`
    const endLabel = `${cycleEnd.getDate()} ${MONTH_SHORT[cycleEnd.getMonth()]}`
    return `${startLabel} → ${endLabel}`
  }, [cycleStart, cycleEnd])

  // Cupo diario canónico — misma definición que Control/Home/Daily
  // Budget Engine: `(sueldo − fijos de ciclo − ahorro) / cycleDays`.
  // El heatmap lo usa como ancla de los thresholds green/amber/red
  // para que un día NO se pinte rojo solo porque el promedio del
  // ciclo todavía es bajo (efecto de pocas muestras).
  const cupoDiario = useMemo(() => {
    const libre = Math.max(
      0,
      dashboard.monthlyIncome -
        dashboard.fixedExpensesMonthlyTotal -
        dashboard.savingsGoal,
    )
    return cycleDays > 0 ? libre / cycleDays : 0
  }, [
    dashboard.monthlyIncome,
    dashboard.fixedExpensesMonthlyTotal,
    dashboard.savingsGoal,
    cycleDays,
  ])

  const cycleExpenses = useMemo(
    () =>
      expenses.filter((e) => {
        const t = new Date(e.created_at).getTime()
        return t >= cycleStartMs && t < cycleEndMs
      }),
    [expenses, cycleStartMs, cycleEndMs],
  )

  const filteredByCategory = useMemo(
    () =>
      selectedCategoryId == null
        ? cycleExpenses
        : cycleExpenses.filter((e) => e.category_id === selectedCategoryId),
    [cycleExpenses, selectedCategoryId],
  )

  const filteredBySmart = useMemo(() => {
    let list = filteredByCategory
    if (smartFilter.priceMin != null) {
      const min = smartFilter.priceMin
      list = list.filter((e) => Math.abs(Number(e.price ?? 0)) >= min)
    }
    if (smartFilter.priceMax != null) {
      const max = smartFilter.priceMax
      list = list.filter((e) => Math.abs(Number(e.price ?? 0)) < max)
    }
    if (smartFilter.dateRange && smartFilter.dateRange !== 'all') {
      list = applyDateRange(list, smartFilter.dateRange, today)
    }
    return list
  }, [filteredByCategory, smartFilter, today])

  const filteredExpenses = useMemo(
    () =>
      selectedDay == null
        ? filteredBySmart
        : filteredBySmart.filter((e) => {
            const d = new Date(e.created_at)
            return d.getDate() === selectedDay
          }),
    [filteredBySmart, selectedDay],
  )

  const filteredTotal = useMemo(
    () => filteredExpenses.reduce((s, e) => s + Math.abs(Number(e.price ?? 0)), 0),
    [filteredExpenses],
  )

  const summaryChip = useMemo(() => {
    const count = filteredExpenses.length
    const period = selectedDay != null ? `día ${selectedDay}` : cycleLabel
    const cat =
      selectedCategoryId == null
        ? 'Todas'
        : (categoriesById.get(selectedCategoryId)?.name ?? 'Todas')
    return `${count} mov · ${period} · ${cat}`
  }, [filteredExpenses.length, selectedDay, cycleLabel, selectedCategoryId, categoriesById])

  const topCategories = useMemo(
    () => computeCategoryWeights(filteredExpenses, categories, 3),
    [filteredExpenses, categories],
  )

  // Daily mood/heatmap, averages and bars all share the same
  // "expenses" base now (already filtered to variable-only at the
  // top of the hook), so the same input feeds totals, lists and
  // mood without divergence between what's shown and what's
  // measured.
  const cycleExpensesByCategory = useMemo(
    () =>
      selectedCategoryId == null
        ? cycleExpenses
        : cycleExpenses.filter((e) => e.category_id === selectedCategoryId),
    [cycleExpenses, selectedCategoryId],
  )

  const dailySpend = useMemo(
    () => computeDailySpend(cycleExpensesByCategory, cycleStart, cycleEnd),
    [cycleExpensesByCategory, cycleStart, cycleEnd],
  )

  const dayMoods = useMemo(
    () =>
      computeGastosDayMoods({
        dailySpend,
        cycleStart,
        cycleDays,
        today,
        cupoDiario,
      }),
    [dailySpend, cycleStart, cycleDays, today, cupoDiario],
  )

  const averageDaily = useMemo(
    () =>
      computeAverageDailySpend({
        expenses,
        today,
        windowDays: 22,
      }),
    [expenses, today],
  )

  const recentDailyBars = useMemo(
    () =>
      computeRecentDailyBars({
        expenses,
        today,
        windowDays: 7,
      }),
    [expenses, today],
  )

  const registrationStreak = useMemo(
    () => computeRegistrationStreak({ expenses, today }),
    [expenses, today],
  )

  const groups = useMemo(
    () => groupGastosByDay({ expenses: filteredExpenses, today }),
    [filteredExpenses, today],
  )

  return {
    expenses,
    categoriesById,
    isLoading: expensesQuery.isLoading || categoriesQuery.isLoading,
    error: expensesQuery.error ?? categoriesQuery.error ?? null,
    selectedCategoryId,
    setSelectedCategoryId,
    selectedDay,
    setSelectedDay,
    smartFilter,
    setSmartFilter,
    clearSmartFilter,
    filteredExpenses,
    filteredTotal,
    summaryChip,
    topCategories,
    dayMoods,
    dailySpend,
    averageDaily,
    recentDailyBars,
    registrationStreak,
    groups,
    today,
    cycleStart,
    cycleEnd,
    cycleDays,
    cycleLabel,
    clearDay: () => setSelectedDay(null),
    clearAll: () => {
      setSelectedDay(null)
      setSelectedCategoryId(null)
      setSmartFilter({})
    },
  }
}

function applyDateRange(
  list: Expense[],
  range: GastosDateRange,
  today: Date,
): Expense[] {
  switch (range) {
    case 'today': {
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).getTime()
      return list.filter((e) => new Date(e.created_at).getTime() >= start)
    }
    case 'last-7': {
      const cutoff = today.getTime() - 7 * 24 * 60 * 60 * 1000
      return list.filter((e) => new Date(e.created_at).getTime() >= cutoff)
    }
    case 'first-3-days': {
      return list.filter((e) => new Date(e.created_at).getDate() <= 3)
    }
    case 'last-3-days': {
      const cutoff = today.getTime() - 3 * 24 * 60 * 60 * 1000
      return list.filter((e) => new Date(e.created_at).getTime() >= cutoff)
    }
    case 'nights': {
      return list.filter((e) => {
        const h = new Date(e.created_at).getHours()
        return h >= 20 || h < 2
      })
    }
    default:
      return list
  }
}
