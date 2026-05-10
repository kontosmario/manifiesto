// Cliente para las 5 RPCs especializadas del Gastos screen.
//
// Cada hook maneja una sola query y una sola surface. El controller
// (`use-gastos-controller.ts`) los compone para mantener una API
// pública estable hacia el screen.

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  GastosCalendarSummary,
  GastosCategoriesResponse,
  GastosCategoryWithCount,
  GastosExpenseRow,
  GastosExpensesForDay,
  GastosExpensesPage,
  GastosHeroSummary,
} from '@/features/gastos/gastos-endpoints.types'

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires'

/** Format a Date as a local-time `YYYY-MM-DD` string for `p_today`
 *  and other day params. Uses the runtime's local TZ — matches the
 *  behavior of the rest of the controller. */
function localIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ─── Query keys ─────────────────────────────────────────────────────
//
// Each key encodes the params that affect the response so React Query
// caches different filter combinations independently. The shared
// prefix `gastos-*` lets `useGastosRealtime` invalidate by prefix
// when an expense lands.

export const gastosEndpointKeys = {
  hero: (
    familyId?: string,
    cycleStartIso?: string,
    cycleEndIso?: string,
    todayIso?: string,
    categoryId?: string | null,
  ) =>
    ['gastos-hero', familyId, cycleStartIso, cycleEndIso, todayIso, categoryId ?? null] as const,
  heroFamily: (familyId?: string) => ['gastos-hero', familyId] as const,

  calendar: (
    familyId?: string,
    cycleStartIso?: string,
    cycleEndIso?: string,
    todayIso?: string,
    cupoDiario?: number,
    categoryId?: string | null,
  ) =>
    [
      'gastos-calendar',
      familyId,
      cycleStartIso,
      cycleEndIso,
      todayIso,
      cupoDiario ?? 0,
      categoryId ?? null,
    ] as const,
  calendarFamily: (familyId?: string) => ['gastos-calendar', familyId] as const,

  categories: (familyId?: string, cycleStartIso?: string, cycleEndIso?: string) =>
    ['gastos-categories', familyId, cycleStartIso, cycleEndIso] as const,
  categoriesFamily: (familyId?: string) => ['gastos-categories', familyId] as const,

  paginated: (
    familyId?: string,
    cycleStartIso?: string,
    cycleEndIso?: string,
    todayIso?: string,
    categoryId?: string | null,
  ) =>
    [
      'gastos-expenses-paginated',
      familyId,
      cycleStartIso,
      cycleEndIso,
      todayIso,
      categoryId ?? null,
    ] as const,
  paginatedFamily: (familyId?: string) => ['gastos-expenses-paginated', familyId] as const,

  forDay: (familyId?: string, isoDate?: string, categoryId?: string | null) =>
    ['gastos-expenses-for-day', familyId, isoDate, categoryId ?? null] as const,
  forDayFamily: (familyId?: string) => ['gastos-expenses-for-day', familyId] as const,
}

// ─── 1. Hero summary ────────────────────────────────────────────────

interface UseGastosHeroSummaryArgs {
  familyId?: string
  cycleStart: Date
  cycleEnd: Date
  today: Date
  categoryId?: string | null
}

export function useGastosHeroSummary(args: UseGastosHeroSummaryArgs) {
  const cycleStartIso = args.cycleStart.toISOString()
  const cycleEndIso = args.cycleEnd.toISOString()
  const todayIso = localIsoDate(args.today)

  return useQuery<GastosHeroSummary>({
    queryKey: gastosEndpointKeys.hero(
      args.familyId,
      cycleStartIso,
      cycleEndIso,
      todayIso,
      args.categoryId,
    ),
    enabled: Boolean(args.familyId),
    // 5 min: el seed de gastos_snapshot popula este key en cold-mount;
    // mutations (create/delete expense) y `useGastosRealtime` invalidan
    // por prefijo, así que el bump es seguro y evita refetches en
    // tab-switches dentro del mismo uso.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!args.familyId) return EMPTY_HERO
      const { data, error } = await supabase.rpc('gastos_hero_summary', {
        p_family_id: args.familyId,
        p_cycle_start: cycleStartIso,
        p_cycle_end: cycleEndIso,
        p_today: todayIso,
        p_timezone: DEFAULT_TIMEZONE,
        p_category_id: args.categoryId ?? null,
      })
      if (error) throw error
      return normalizeHero(data as GastosHeroSummary | null)
    },
  })
}

const EMPTY_HERO: GastosHeroSummary = {
  total: 0,
  count: 0,
  cycle_days_elapsed: 1,
  average_daily: 0,
  top_categories: [],
  recent_daily_bars: [0, 0, 0, 0, 0, 0, 0],
}

function normalizeHero(raw: GastosHeroSummary | null): GastosHeroSummary {
  if (!raw) return EMPTY_HERO
  return {
    total: Number(raw.total ?? 0),
    count: Number(raw.count ?? 0),
    cycle_days_elapsed: Math.max(1, Number(raw.cycle_days_elapsed ?? 1)),
    average_daily: Number(raw.average_daily ?? 0),
    top_categories: (raw.top_categories ?? []).map((r) => ({
      ...r,
      amount: Number(r.amount ?? 0),
      percent: Number(r.percent ?? 0),
    })),
    recent_daily_bars: (raw.recent_daily_bars ?? []).map((n) => Number(n ?? 0)),
  }
}

// ─── 2. Calendar summary ────────────────────────────────────────────

interface UseGastosCalendarSummaryArgs {
  familyId?: string
  cycleStart: Date
  cycleEnd: Date
  today: Date
  cupoDiario: number
  categoryId?: string | null
}

export function useGastosCalendarSummary(args: UseGastosCalendarSummaryArgs) {
  const cycleStartIso = args.cycleStart.toISOString()
  const cycleEndIso = args.cycleEnd.toISOString()
  const todayIso = localIsoDate(args.today)

  return useQuery<GastosCalendarSummary>({
    queryKey: gastosEndpointKeys.calendar(
      args.familyId,
      cycleStartIso,
      cycleEndIso,
      todayIso,
      args.cupoDiario,
      args.categoryId,
    ),
    enabled: Boolean(args.familyId),
    // 5 min — mismo razonamiento que useGastosHeroSummary: el seed
    // del snapshot + mutations/realtime cubren los cambios reales.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!args.familyId) return { days: [] }
      const { data, error } = await supabase.rpc('gastos_calendar_summary', {
        p_family_id: args.familyId,
        p_cycle_start: cycleStartIso,
        p_cycle_end: cycleEndIso,
        p_today: todayIso,
        p_cupo_diario: args.cupoDiario,
        p_timezone: DEFAULT_TIMEZONE,
        p_category_id: args.categoryId ?? null,
      })
      if (error) throw error
      return (data as GastosCalendarSummary | null) ?? { days: [] }
    },
  })
}

// ─── 3. Categories with counts ──────────────────────────────────────

interface UseGastosCategoriesWithCountsArgs {
  familyId?: string
  cycleStart: Date
  cycleEnd: Date
}

export function useGastosCategoriesWithCounts(
  args: UseGastosCategoriesWithCountsArgs,
) {
  const cycleStartIso = args.cycleStart.toISOString()
  const cycleEndIso = args.cycleEnd.toISOString()

  return useQuery<GastosCategoryWithCount[]>({
    queryKey: gastosEndpointKeys.categories(args.familyId, cycleStartIso, cycleEndIso),
    enabled: Boolean(args.familyId),
    // Categories cambian rara vez (solo cuando el usuario crea una
    // nueva). 5 min staleTime + invalidaciones explícitas en las
    // mutations de categoría cubren los cambios reales.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!args.familyId) return []
      const { data, error } = await supabase.rpc('gastos_categories_with_counts', {
        p_family_id: args.familyId,
        p_cycle_start: cycleStartIso,
        p_cycle_end: cycleEndIso,
      })
      if (error) throw error
      const payload = (data as GastosCategoriesResponse | null) ?? { categories: [] }
      return payload.categories.map((c) => ({
        ...c,
        count_in_cycle: Number(c.count_in_cycle ?? 0),
      }))
    },
  })
}

// ─── 4. Expenses paginated (infinite query) ─────────────────────────

interface UseGastosExpensesPaginatedArgs {
  familyId?: string
  cycleStart: Date
  cycleEnd: Date
  today: Date
  categoryId?: string | null
  daysPerPage?: number
}

export function useGastosExpensesPaginated(args: UseGastosExpensesPaginatedArgs) {
  const cycleStartIso = args.cycleStart.toISOString()
  const cycleEndIso = args.cycleEnd.toISOString()
  const todayIso = localIsoDate(args.today)
  const daysPerPage = args.daysPerPage ?? 2

  return useInfiniteQuery<GastosExpensesPage, Error>({
    queryKey: gastosEndpointKeys.paginated(
      args.familyId,
      cycleStartIso,
      cycleEndIso,
      todayIso,
      args.categoryId,
    ),
    enabled: Boolean(args.familyId),
    // 5 min — el seed del snapshot popula la primera página en
    // cold-mount; mutations + realtime invalidan por prefijo.
    staleTime: 5 * 60_000,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    queryFn: async ({ pageParam }) => {
      if (!args.familyId) return { expenses: [], next_cursor: null, has_more: false }
      const { data, error } = await supabase.rpc('gastos_expenses_paginated', {
        p_family_id: args.familyId,
        p_cycle_start: cycleStartIso,
        p_cycle_end: cycleEndIso,
        p_before_iso_date: pageParam,
        p_days_per_page: daysPerPage,
        p_today: todayIso,
        p_timezone: DEFAULT_TIMEZONE,
        p_category_id: args.categoryId ?? null,
      })
      if (error) throw error
      const payload = (data as GastosExpensesPage | null) ?? {
        expenses: [],
        next_cursor: null,
        has_more: false,
      }
      return {
        expenses: payload.expenses.map(normalizeExpenseRow),
        next_cursor: payload.next_cursor,
        has_more: Boolean(payload.has_more),
      }
    },
  })
}

// ─── 5. Expenses for day ────────────────────────────────────────────

interface UseGastosExpensesForDayArgs {
  familyId?: string
  /** When `null`, the hook is disabled. Pass an ISO date `YYYY-MM-DD`
   *  to trigger the fetch (typical caller: when a day is selected
   *  in the calendar). */
  isoDate: string | null
  categoryId?: string | null
}

export function useGastosExpensesForDay(args: UseGastosExpensesForDayArgs) {
  return useQuery<GastosExpenseRow[]>({
    queryKey: gastosEndpointKeys.forDay(args.familyId, args.isoDate ?? undefined, args.categoryId),
    enabled: Boolean(args.familyId && args.isoDate),
    staleTime: 30_000,
    queryFn: async () => {
      if (!args.familyId || !args.isoDate) return []
      const { data, error } = await supabase.rpc('gastos_expenses_for_day', {
        p_family_id: args.familyId,
        p_iso_date: args.isoDate,
        p_timezone: DEFAULT_TIMEZONE,
        p_category_id: args.categoryId ?? null,
      })
      if (error) throw error
      const payload = (data as GastosExpensesForDay | null) ?? { expenses: [] }
      return payload.expenses.map(normalizeExpenseRow)
    },
  })
}

// ─── helpers ────────────────────────────────────────────────────────

function normalizeExpenseRow(row: GastosExpenseRow): GastosExpenseRow {
  return {
    ...row,
    price: Number(row.price ?? 0),
  }
}
