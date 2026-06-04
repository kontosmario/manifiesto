import { useCallback, useMemo, useState } from 'react'
import {
  groupGastosByDay,
  type CategoryLite,
  type CategoryWeightRow,
  type DayOfMonthSpendRow,
  type GastosDayMood,
  type GastosGroup,
} from '@/features/gastos/gastos-aggregates.model'
import {
  useGastosCalendarSummary,
  useGastosCategoriesWithCounts,
  useGastosExpensesForDay,
  useGastosExpensesPaginated,
  useGastosHeroSummary,
} from '@/features/gastos/use-gastos-endpoints'
import type { GastosExpenseRow } from '@/features/gastos/gastos-endpoints.types'
import type { Expense } from '@/features/expenses/use-expenses'
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'

export interface UseGastosControllerOptions {
  /** Seed initial filter from route params (Asistente deep-links). */
  initialCategoryId?: string | null
}

export interface UseGastosControllerResult {
  // raw
  expenses: Expense[]
  categoriesById: Map<string, CategoryLite>
  /** Per-cycle count of expenses per category, sourced server-side
   *  via `gastos_categories_with_counts`. Replaces the client-side
   *  count over `filteredExpenses` which was wrong as soon as the
   *  list became paginated. */
  expenseCountByCategoryId: Map<string, number>
  isLoading: boolean
  isFetching: boolean
  error: unknown
  refetchAll: () => Promise<void>
  // filter state
  selectedCategoryId: string | null
  setSelectedCategoryId: (id: string | null) => void
  selectedDay: number | null
  setSelectedDay: (day: number | null) => void
  hasAnyFilter: boolean
  // filtered result
  filteredExpenses: Expense[]
  filteredTotal: number
  summaryChip: string
  // aggregates (server-computed)
  topCategories: CategoryWeightRow[]
  dayMoods: Record<number, GastosDayMood>
  /** Day-of-month indexed (1..31). Filled from the calendar RPC. */
  dailySpend: Record<number, DayOfMonthSpendRow>
  averageDaily: number
  recentDailyBars: number[]
  groups: GastosGroup[]
  // cycle context
  today: Date
  cycleStart: Date
  cycleEnd: Date
  cycleDays: number
  cycleDaysElapsed: number
  cycleLabel: string
  // pagination (Phase 4 — virtual scroll)
  /** Loads the next chunk of older days. No-op when `hasNextPage` is
   *  false or already fetching. */
  fetchNextPage: () => Promise<void>
  hasNextPage: boolean
  isFetchingNextPage: boolean
  // actions
  clearDay: () => void
  clearAll: () => void
}

const MONTH_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function useGastosController(
  familyId: string,
  options: UseGastosControllerOptions = {},
): UseGastosControllerResult {
  const { cycle, today } = usePayCycle(familyId)
  const dashboard = useFamilyDashboard(familyId)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    options.initialCategoryId ?? null,
  )
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const cycleStart = cycle.start
  const cycleEnd = cycle.end
  const cycleDays = cycle.days
  const cycleStartMs = cycleStart.getTime()

  const cycleDaysElapsedClient = useMemo(() => {
    const ms = today.getTime() - cycleStartMs
    const elapsed = Math.floor(ms / MS_PER_DAY) + 1
    return Math.max(1, Math.min(cycleDays, elapsed))
  }, [today, cycleStartMs, cycleDays])

  const cycleLabel = useMemo(() => {
    const startLabel = `${cycleStart.getDate()} ${MONTH_SHORT[cycleStart.getMonth()]}`
    const endLabel = `${cycleEnd.getDate()} ${MONTH_SHORT[cycleEnd.getMonth()]}`
    return `${startLabel} → ${endLabel}`
  }, [cycleStart, cycleEnd])

  // Cupo diario canónico — pasado al server para anchorar moods.
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

  // ── Hooks de los 5 endpoints ────────────────────────────────────
  const heroQuery = useGastosHeroSummary({
    familyId,
    cycleStart,
    cycleEnd,
    today,
    categoryId: selectedCategoryId,
  })
  const calendarQuery = useGastosCalendarSummary({
    familyId,
    cycleStart,
    cycleEnd,
    today,
    cupoDiario,
    categoryId: selectedCategoryId,
  })
  const categoriesQuery = useGastosCategoriesWithCounts({
    familyId,
    cycleStart,
    cycleEnd,
  })
  const paginatedQuery = useGastosExpensesPaginated({
    familyId,
    cycleStart,
    cycleEnd,
    today,
    categoryId: selectedCategoryId,
    // 7 días = 1 semana ~= viewport típico de una pantalla. Antes era
    // 2: el SectionList renderizaba contenido tan corto que el
    // onEndReached (threshold 0.5) disparaba auto-fetchNextPage en
    // cadena, causando 3 RPC calls en cold-start sin que el usuario
    // hiciera scroll. Con 7 días la primera página llena el viewport
    // y la segunda solo se pide cuando el usuario realmente scrollea.
    daysPerPage: 7,
  })

  // Convert day-of-month → ISO YYYY-MM-DD for the day-detail RPC.
  const selectedDayIso = useMemo(() => {
    if (selectedDay == null) return null
    for (let i = 0; i < cycleDays; i++) {
      const d = new Date(
        cycleStart.getFullYear(),
        cycleStart.getMonth(),
        cycleStart.getDate() + i,
      )
      if (d.getDate() === selectedDay) {
        return formatLocalIso(d)
      }
    }
    return null
  }, [selectedDay, cycleStart, cycleDays])

  const forDayQuery = useGastosExpensesForDay({
    familyId,
    isoDate: selectedDayIso,
    categoryId: selectedCategoryId,
  })

  // ── Categorías ──────────────────────────────────────────────────
  const categoriesById = useMemo<Map<string, CategoryLite>>(() => {
    const m = new Map<string, CategoryLite>()
    for (const c of categoriesQuery.data ?? []) {
      m.set(c.id, { id: c.id, name: c.name, color: c.color })
    }
    return m
  }, [categoriesQuery.data])

  const expenseCountByCategoryId = useMemo<Map<string, number>>(() => {
    const m = new Map<string, number>()
    for (const c of categoriesQuery.data ?? []) {
      m.set(c.id, c.count_in_cycle)
    }
    return m
  }, [categoriesQuery.data])

  // ── Hero (server-computed at cycle scope) ───────────────────────
  const hero = heroQuery.data
  const cycleTotal = hero?.total ?? 0
  const cycleCount = hero?.count ?? 0
  const cycleDaysElapsed = hero?.cycle_days_elapsed ?? cycleDaysElapsedClient
  const cycleAverageDaily = hero?.average_daily ?? 0
  const recentDailyBars = useMemo(
    () => hero?.recent_daily_bars ?? [0, 0, 0, 0, 0, 0, 0],
    [hero?.recent_daily_bars],
  )
  const cycleTopCategories = useMemo<CategoryWeightRow[]>(
    () =>
      (hero?.top_categories ?? []).map((r) => ({
        id: r.id,
        label: r.name,
        color: r.color,
        amount: r.amount,
        percent: r.percent,
      })),
    [hero?.top_categories],
  )

  // ── Calendar (server-computed moods + per-day totals) ───────────
  const dayMoods = useMemo<Record<number, GastosDayMood>>(() => {
    const out: Record<number, GastosDayMood> = {}
    for (const d of calendarQuery.data?.days ?? []) {
      // Si dos días del ciclo comparten día-de-mes (caso 31), el
      // segundo encontrado pisa al primero. Aceptable: el calendario
      // grafica una grilla de día-de-mes única en ciclos típicos.
      out[d.day] = d.mood
    }
    return out
  }, [calendarQuery.data])

  const dailySpend = useMemo<Record<number, DayOfMonthSpendRow>>(() => {
    const out: Record<number, DayOfMonthSpendRow> = {}
    for (const d of calendarQuery.data?.days ?? []) {
      out[d.day] = { day: d.day, total: d.total, count: d.count }
    }
    return out
  }, [calendarQuery.data])

  // ── Movimientos (paginated + day-detail) ────────────────────────
  const paginatedExpenses = useMemo<Expense[]>(
    () =>
      (paginatedQuery.data?.pages ?? [])
        .flatMap((p) => p.expenses)
        .map(rowToExpense),
    [paginatedQuery.data],
  )

  const dayDetailExpenses = useMemo<Expense[]>(
    () => {
      // Guard: clientes que tengan un cache corrupto del bug previo
      // (object-spread sobre el array por el optimistic mirror con
      // shape equivocada) llegan acá con un objeto mutante en vez de
      // array. Detectamos y devolvemos []; el próximo refetch trae la
      // shape correcta.
      const data = forDayQuery.data
      return Array.isArray(data) ? data.map(rowToExpense) : []
    },
    [forDayQuery.data],
  )

  // `expenses` no-filter view: paginated rows. Used by consumers that
  // want the chronological feed (e.g., empty-state detection).
  const expenses = paginatedExpenses

  // `filteredExpenses`: when the user tapped a day in the calendar,
  // we serve the day-detail RPC; otherwise the paginated feed.
  const filteredExpenses =
    selectedDay != null ? dayDetailExpenses : paginatedExpenses

  const groups = useMemo(
    () => groupGastosByDay({ expenses: filteredExpenses, today }),
    [filteredExpenses, today],
  )

  // ── Day-scoped hero stats (when the user tapped a day) ──────────
  // The cycle-wide hero RPC keeps showing month totals; we override
  // the hero outputs here so the card reflects exactly the day in
  // focus. Top categories for the day are computed client-side over
  // `dayDetailExpenses` (already loaded for the list).
  const dayTopCategories = useMemo<CategoryWeightRow[]>(() => {
    if (selectedDay == null) return cycleTopCategories
    const totals = new Map<string, number>()
    for (const e of dayDetailExpenses) {
      totals.set(e.category_id, (totals.get(e.category_id) ?? 0) + e.price)
    }
    const dayTotal = Array.from(totals.values()).reduce((s, v) => s + v, 0)
    if (dayTotal === 0) return []
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, amount]) => {
        const c = categoriesById.get(id)
        return {
          id,
          label: c?.name ?? 'Sin categoría',
          color: c?.color ?? '#888',
          amount,
          percent: Math.round((amount / dayTotal) * 100),
        }
      })
  }, [selectedDay, dayDetailExpenses, cycleTopCategories, categoriesById])

  // ── Hero outputs (filtered by selectedDay if set) ───────────────
  const filteredTotal =
    selectedDay != null ? (dailySpend[selectedDay]?.total ?? 0) : cycleTotal
  const filteredCount =
    selectedDay != null ? (dailySpend[selectedDay]?.count ?? 0) : cycleCount
  const topCategories =
    selectedDay != null ? dayTopCategories : cycleTopCategories
  // Per-day average doesn't make sense — we pass 0 so consumers can
  // hide the "Promedio día" row when a single day is in focus.
  const averageDaily = selectedDay != null ? 0 : cycleAverageDaily

  // ── Summary chip ────────────────────────────────────────────────
  const summaryChip = useMemo(() => {
    const period = selectedDay != null ? `día ${selectedDay}` : cycleLabel
    const cat =
      selectedCategoryId == null
        ? 'Todas'
        : (categoriesById.get(selectedCategoryId)?.name ?? 'Todas')
    return `${filteredCount} mov · ${period} · ${cat}`
  }, [
    filteredCount,
    selectedDay,
    cycleLabel,
    selectedCategoryId,
    categoriesById,
  ])

  // ── Filter state derived ────────────────────────────────────────
  const hasAnyFilter = selectedCategoryId != null || selectedDay != null

  // ── Loading / error consolidation ───────────────────────────────
  const isLoading =
    heroQuery.isLoading ||
    calendarQuery.isLoading ||
    categoriesQuery.isLoading ||
    paginatedQuery.isLoading
  const isFetching =
    heroQuery.isFetching ||
    calendarQuery.isFetching ||
    categoriesQuery.isFetching ||
    paginatedQuery.isFetching ||
    forDayQuery.isFetching
  const error =
    heroQuery.error ??
    calendarQuery.error ??
    categoriesQuery.error ??
    paginatedQuery.error ??
    forDayQuery.error ??
    null

  // ── Pagination handle (Phase 4) ─────────────────────────────────
  const fetchNextPage = useCallback(async () => {
    if (paginatedQuery.hasNextPage && !paginatedQuery.isFetchingNextPage) {
      await paginatedQuery.fetchNextPage()
    }
  }, [paginatedQuery])

  // ── Refetch all (pull-to-refresh) ───────────────────────────────
  const refetchAll = useCallback(async () => {
    await Promise.all([
      heroQuery.refetch(),
      calendarQuery.refetch(),
      categoriesQuery.refetch(),
      paginatedQuery.refetch(),
      selectedDay != null ? forDayQuery.refetch() : Promise.resolve(),
      dashboard.refetchAll(),
    ])
  }, [heroQuery, calendarQuery, categoriesQuery, paginatedQuery, forDayQuery, dashboard, selectedDay])

  const clearDay = useCallback(() => setSelectedDay(null), [])
  const clearAll = useCallback(() => {
    setSelectedDay(null)
    setSelectedCategoryId(null)
  }, [])

  return {
    expenses,
    categoriesById,
    expenseCountByCategoryId,
    isLoading,
    isFetching,
    error,
    refetchAll,
    selectedCategoryId,
    setSelectedCategoryId,
    selectedDay,
    setSelectedDay,
    hasAnyFilter,
    filteredExpenses,
    filteredTotal,
    summaryChip,
    topCategories,
    dayMoods,
    dailySpend,
    averageDaily,
    recentDailyBars,
    groups,
    today,
    cycleStart,
    cycleEnd,
    cycleDays,
    cycleDaysElapsed,
    cycleLabel,
    fetchNextPage,
    hasNextPage: Boolean(paginatedQuery.hasNextPage),
    isFetchingNextPage: paginatedQuery.isFetchingNextPage,
    clearDay,
    clearAll,
  }
}

/** Map a server-side embed row to the legacy `Expense` shape so
 *  downstream code (groupGastosByDay, the screen's renderItem) keeps
 *  working without changes. */
function rowToExpense(row: GastosExpenseRow): Expense {
  return {
    id: row.id,
    family_id: row.family_id,
    category_id: row.category_id,
    commitment_id: row.commitment_id,
    description: row.description,
    notes: row.notes,
    price: row.price,
    created_at: row.created_at,
    created_by: row.created_by,
    creator_display_name: row.creator_display_name ?? 'Sin nombre',
    paid_in_arrears: row.paid_in_arrears === true,
  }
}

function formatLocalIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
