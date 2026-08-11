import { useCallback, useMemo, useState } from 'react'
import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import i18n from '@/lib/i18n'
import {
  groupGastosByDay,
  type CategoryLite,
  type CategoryWeightRow,
  type DayOfMonthSpendRow,
  type GastosDayMood,
  type GastosGroup,
} from '@/features/gastos/gastos-aggregates.model'
import {
  GASTOS_DAYS_PER_PAGE,
  useGastosCalendarSummary,
  useGastosCategoriesWithCounts,
  useGastosExpensesForDay,
  useGastosExpensesPaginated,
  useGastosHeroSummary,
  gastosEndpointKeys,
} from '@/features/gastos/use-gastos-endpoints'
import type {
  GastosExpenseRow,
  GastosExpensesPage,
} from '@/features/gastos/gastos-endpoints.types'
import { localizeCategoryNameByName } from '@/features/categories/localize-category-name'
import { computeCupoDiario, resolveCupoIncomeBase } from '@/features/gastos/cupo-diario'
import { useCycleIncomeEventsTotal } from '@/features/income/use-income-events'
import { formatLocalDateKey } from '@/utils/pay-cycle'
import type { Expense } from '@/features/expenses/use-expenses'
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { useFamilyDashboard, type FamilyDashboard } from '@/hooks/use-family-dashboard'
import { resolveIncomeMode } from '@/features/finance/family-finance.model'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { financeToCycleConfig } from '@/utils/finance-cycle-config'
import { formatCycleLabel } from '@/utils/format-cycle-label'

export interface UseGastosControllerOptions {
  /** Seed initial filter from route params (Asistente deep-links). */
  initialCategoryId?: string | null
  /**
   * Dashboard del hogar YA computado por la pantalla. PERF: `useFamilyDashboard`
   * corre `buildFamilyDashboardSnapshot` en un `useMemo` propio (un `forEach`
   * sobre TODOS los gastos de la familia). React Query dedupea las QUERIES
   * subyacentes entre dos llamadas al hook, pero NO el useMemo: montarlo en la
   * pantalla Y acá pagaba esa agregación DOS veces por render.
   *
   * Opcional a propósito (retrocompatible): la pantalla vieja no lo pasa y el
   * hook sigue montando el suyo, con el comportamiento exacto de siempre.
   */
  dashboard?: FamilyDashboard
  /**
   * Exponer `isLoading`/`isFetching` consolidados. PERF: RQ v5 trackea qué
   * propiedades del resultado LEE el consumidor y solo re-renderiza cuando esas
   * cambian. Tocar `isFetching` de las 5 queries suscribe la pantalla a CADA
   * transición de fetching de las 5 → ~10 renders extra por ronda de refetch,
   * cada uno arrastrando el ListHeader y las filas.
   *
   * Default `true` = comportamiento histórico (la pantalla vieja los consume).
   * La neo pasa `false`: solo usa `isFetchingNextPage`, que se lee aparte.
   * Con `false` ambos campos quedan en `false` — si algún consumidor futuro los
   * necesita (p.ej. un dim del hero mientras se re-filtra), volver a `true`.
   */
  trackFetchingState?: boolean
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
  /** Cycle-scoped hero outputs — NUNCA se re-escopan al día seleccionado.
   *  El rediseño mantiene el hero a nivel ciclo aun con un día en foco (el
   *  day-detail lleva los números del día), así que lee estos en vez de los
   *  `filtered*` (que sí colapsan al día). La vista vieja ignora estos y
   *  sigue usando `filteredTotal`/`averageDaily`/`topCategories`. */
  cycleTotal: number
  cycleAverageDaily: number
  cycleTopCategories: CategoryWeightRow[]
  cycleSummaryChip: string
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
  /** Régimen de ingreso del hogar — el empty state del SectionList lo
   *  usa para no pedir "Confirma tu cobro" en modo variable. */
  incomeMode: 'fixed' | 'dynamic'
  // pagination (Phase 4 — virtual scroll)
  /** Loads the next chunk of older days. No-op when `hasNextPage` is
   *  false or already fetching. */
  fetchNextPage: () => Promise<void>
  hasNextPage: boolean
  isFetchingNextPage: boolean
  /** Recorta el infinite query de movimientos a su PRIMERA página (sin
   *  refetch: edición del cache precedida de un `cancelQueries` para que ningún
   *  fetch en vuelo pise el recorte). La pantalla lo llama SOLO al salir a otra
   *  tab (no al pushear una ruta encima) para que volver a Gastos desde una
   *  tab hermana arranque en 1 página. Ver la nota larga en el cuerpo del hook. */
  resetPagination: () => Promise<void>
  // actions
  clearDay: () => void
  clearAll: () => void
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function useGastosController(
  familyId: string,
  options: UseGastosControllerOptions = {},
): UseGastosControllerResult {
  const { cycle, today } = usePayCycle(familyId)
  const queryClient = useQueryClient()
  // Fallback: sin `options.dashboard` el hook monta el suyo (pantalla vieja).
  // Las queries subyacentes están dedupeadas por RQ, así que montar el hook de
  // más NO cuesta red — cuesta el useMemo de agregación. Ver la nota del prop.
  const ownDashboard = useFamilyDashboard(options.dashboard ? undefined : familyId)
  const dashboard = options.dashboard ?? ownDashboard
  const financeQuery = useFamilyFinance(familyId)
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

  const cycleType = useMemo(
    () => financeToCycleConfig(financeQuery.data).cycle_type,
    [financeQuery.data],
  )
  // Régimen de ingreso — el empty state del SectionList lo usa para no
  // pedir "Confirma tu cobro" en modo variable (no existe esa acción).
  const incomeMode = resolveIncomeMode(financeQuery.data)
  const cycleLabel = useMemo(
    () => formatCycleLabel(cycle, cycleType),
    [cycle, cycleType],
  )

  // Cupo diario canónico — pasado al server para anchorar moods. Redondeado
  // vía helper compartido para que la queryKey del calendar coincida con la
  // del snapshot y el warm-prefetch (ver cupo-diario.ts). Base dinámica =
  // ingresos del ciclo + override (misma query que el screen/warm).
  const cupoIncomeQuery = useCycleIncomeEventsTotal(
    familyId,
    formatLocalDateKey(dashboard.monthlyAccounting.start),
    formatLocalDateKey(dashboard.monthlyAccounting.end),
  )
  const cupoDiario = useMemo(
    () =>
      computeCupoDiario({
        monthlyIncome: resolveCupoIncomeBase({
          incomeMode,
          monthlyIncome: dashboard.monthlyIncome,
          cycleIncomeTotal: cupoIncomeQuery.data ?? 0,
          cycleStartingBalanceOverride: dashboard.cycleStartingBalanceOverride,
        }),
        fixedExpensesMonthlyTotal: dashboard.fixedExpensesMonthlyTotal,
        savingsGoal: dashboard.savingsGoal,
        cycleDays,
      }),
    [
      incomeMode,
      dashboard.monthlyIncome,
      dashboard.cycleStartingBalanceOverride,
      cupoIncomeQuery.data,
      dashboard.fixedExpensesMonthlyTotal,
      dashboard.savingsGoal,
      cycleDays,
    ],
  )

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
    // Días de la PRIMERA página — constante compartida (ver
    // GASTOS_DAYS_PER_PAGE). Volvió a 2 ("los últimos 2 días", pedido del
    // owner). El 7 anterior existía para tapar la cascada de `onEndReached`
    // al montar con contenido corto; eso hoy lo resuelve el gate por GESTO
    // de las screens (`canPaginateRef`) + threshold al fondo real.
    // Las páginas SIGUIENTES usan `GASTOS_DAYS_PER_PAGE_NEXT` (default del
    // hook): 2 en todas amplificaba cada invalidación a ~15 round-trips.
    daysPerPage: GASTOS_DAYS_PER_PAGE,
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
      // Display localizado NO destructivo: el RPC de counts no trae
      // template_id, así que matcheamos por (name, scope='expense').
      m.set(c.id, {
        id: c.id,
        name: localizeCategoryNameByName(c.name, 'expense'),
        // Crudo de la DB → fuente para ícono/color (los matchers son ES).
        rawName: c.name,
        color: c.color,
      })
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
        // El hero RPC devuelve el `name` crudo (server-side, sin i18n).
        // Re-resolvemos por id contra el mapa ya localizado; si la
        // categoría no está en el mapa (raro), caemos al name del RPC.
        label: categoriesById.get(r.id)?.name ?? r.name,
        rawName: r.name,
        color: r.color,
        amount: r.amount,
        percent: r.percent,
      })),
    [hero?.top_categories, categoriesById],
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
      // shape equivocada) llegan aquí con un objeto mutante en vez de
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
          label: c?.name ?? i18n.t('gastos:movementRow.noCategory'),
          rawName: c?.rawName ?? '',
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
    const period = selectedDay != null ? i18n.t('gastos:summaryChip.day', { day: selectedDay }) : cycleLabel
    const cat =
      selectedCategoryId == null
        ? i18n.t('gastos:smartFilter.all')
        : (categoriesById.get(selectedCategoryId)?.name ?? i18n.t('gastos:smartFilter.all'))
    return i18n.t('gastos:summaryChip.text', { count: filteredCount, period, cat })
  }, [
    filteredCount,
    selectedDay,
    cycleLabel,
    selectedCategoryId,
    categoriesById,
  ])

  // Cycle-scoped chip — igual que `summaryChip` pero SIEMPRE a nivel ciclo
  // (cuenta del ciclo + label del ciclo), aunque haya un día seleccionado.
  // El hero del rediseño lo consume para no contradecir el total del ciclo
  // que muestra mientras el day-detail lleva los números del día.
  const cycleSummaryChip = useMemo(() => {
    const cat =
      selectedCategoryId == null
        ? i18n.t('gastos:smartFilter.all')
        : (categoriesById.get(selectedCategoryId)?.name ?? i18n.t('gastos:smartFilter.all'))
    return i18n.t('gastos:summaryChip.text', { count: cycleCount, period: cycleLabel, cat })
  }, [cycleCount, cycleLabel, selectedCategoryId, categoriesById])

  // ── Filter state derived ────────────────────────────────────────
  const hasAnyFilter = selectedCategoryId != null || selectedDay != null

  // ── Loading / error consolidation ───────────────────────────────
  // PERF · leer estos campos SUSCRIBE al consumidor a cada transición de
  // fetching de las 5 queries (RQ v5 trackea propiedades accedidas). Detrás de
  // `trackFetchingState` para que una pantalla que no los dibuja no pague ~10
  // re-renders por ronda de refetch. Ver la nota del prop.
  const trackFetchingState = options.trackFetchingState ?? true
  const isLoading = trackFetchingState
    ? heroQuery.isLoading ||
      calendarQuery.isLoading ||
      categoriesQuery.isLoading ||
      paginatedQuery.isLoading
    : false
  const isFetching = trackFetchingState
    ? heroQuery.isFetching ||
      calendarQuery.isFetching ||
      categoriesQuery.isFetching ||
      paginatedQuery.isFetching ||
      forDayQuery.isFetching
    : false
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

  // `hasNextPage` DERIVADO DE LO QUE SE RENDERIZA, no del `hasNextPage` de RQ.
  //
  // POR QUÉ. `InfiniteQueryObserver.createResult` computa
  // `hasNextPage: hasNextPage(options, state.data)` — el estado CRUDO de la
  // query, NO el resultado con `placeholderData`. Al tocar un chip del filtro
  // cambia `categoryId` → queryKey nueva → `state.data` es undefined durante
  // todo el round-trip, así que `hasNextPage` cae a false mientras
  // `paginatedQuery.data` (el placeholder de keepPreviousData) SIGUE mostrando
  // las filas del filtro anterior. Consecuencia visible: el footer del feed
  // cambiaba a "fin del ciclo" y el botón "Ver días anteriores" DESAPARECÍA en
  // plena transición — justo lo que keepPreviousData venía a suavizar.
  //
  // La fórmula es la MISMA de RQ (`getNextPageParam(lastPage) != null`, o sea
  // `last.next_cursor != null`), aplicada a la data que la lista está
  // dibujando. Sin placeholder da idéntico resultado que el de RQ.
  //
  // OJO · `fetchNextPage` sigue guardeado por el `hasNextPage` de RQ: durante
  // la transición el botón se ve pero no dispara (RQ todavía no tiene páginas
  // sobre las que avanzar). Es un no-op de ~300ms, no un estado mentiroso.
  const hasNextPage = Boolean(
    paginatedQuery.data?.pages.at(-1)?.next_cursor != null,
  )

  // ── Reset de paginación (volver a la 1ª página) ─────────────────
  //
  // POR QUÉ EXISTE. `useInfiniteQuery` ACUMULA páginas en `data.pages` y no
  // las suelta nunca por su cuenta:
  //   · la tab Gastos se pre-monta (`lazy:false`) y NO se desmonta al cambiar
  //     de tab (`freezeOnBlur:false`) → el observer del query vive toda la
  //     sesión y `data.pages` crece monótono;
  //   · aunque se desmontara, el `gcTime` global es 24h (query-client.ts) y RQ
  //     v5 restaura `data.pages` ENTERO al re-montar;
  //   · peor: cualquier invalidación (realtime `paginatedFamily`, mutations,
  //     pull-to-refresh) hace que RQ v5 re-fetchee TODAS las páginas cargadas
  //     en secuencia (`infiniteQueryBehavior`: `remainingPages =
  //     oldPages.length`) → N round-trips por cada gasto que toca alguien.
  // Resultado: después del primer scroll, "entrar a Gastos" mostraba (y
  // re-pedía) los ~105 movimientos de una.
  //
  // POR QUÉ NO `maxPages`. En RQ v5 `maxPages` recorta con `addToEnd`, que
  // tira la página del PRINCIPIO (`newItems.slice(1)`) al traer una nueva.
  // Acá "next" = días MÁS VIEJOS, así que recortaría los días MÁS RECIENTES —
  // el tope del feed, justo donde está el usuario. Y como esta query no define
  // `getPreviousPageParam` (es unidireccional), esa cabeza no se puede
  // recuperar: `hasPreviousPage` es false por contrato. Descartado.
  //
  // QUÉ HACE. Edición del cache (sin refetch, sin invalidar) que deja solo la
  // 1ª página, por PREFIJO de familia → cubre todas las combos cacheadas (cada
  // categoría del filtro, cada ciclo). `next_cursor` de la página 1 sobrevive
  // intacto → `hasNextPage` sigue true y tanto la auto-paginación por scroll
  // como el botón "Ver días anteriores" siguen funcionando exactamente igual.
  //
  // CANCELAR ANTES DE ESCRIBIR. `setQueriesData` sin cancelar primero deja una
  // carrera: un `fetchNextPage` en vuelo capturó `oldPages` al arrancar y, al
  // resolver, re-escribe el slice COMPLETO (RQ v5 mergea sobre las páginas de
  // ese arranque) → pisaría este recorte y volvería a inflar `data.pages`.
  // `cancelQueries` aborta esos fetches y descarta su writeback. Mismo patrón
  // que las mutations de use-expenses.ts (onMutate cancela paginatedFamily).
  const resetPagination = useCallback(async () => {
    const queryKey = gastosEndpointKeys.paginatedFamily(familyId)
    await queryClient.cancelQueries({ queryKey })
    queryClient.setQueriesData<InfiniteData<GastosExpensesPage, string | null>>(
      { queryKey },
      (data) => {
        if (!data || data.pages.length <= 1) return data
        return { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) }
      },
    )
  }, [queryClient, familyId])

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
    cycleTotal,
    cycleAverageDaily,
    cycleTopCategories,
    cycleSummaryChip,
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
    incomeMode,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage: paginatedQuery.isFetchingNextPage,
    resetPagination,
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
    creator_display_name: row.creator_display_name ?? i18n.t('gastos:misc.noName'),
    paid_in_arrears: row.paid_in_arrears === true,
  }
}

function formatLocalIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
