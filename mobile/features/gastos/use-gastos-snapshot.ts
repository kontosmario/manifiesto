// Hook + cache-seeding para la pantalla Gastos.
//
// Llama a la RPC `gastos_snapshot()` que bundlea en una sola request
// los 4 endpoints especializados (hero, calendar, categories, primera
// página de paginated) más la data de streak (row + marked_days). El
// queryFn seedéa las 6 caches que `useGastosController` y `useStreak`
// consumen, así esos hooks renderean con cache hot y no disparan sus
// propios fetches.
//
// Patrón y razonamiento idéntico a `useHomeSnapshot`: el snapshot
// queryFn pobla las caches SÍNCRONAMENTE antes de que React monte los
// consumers; el screen tiene que gateear su contenido en `snapshot.data`
// para que ese orden se respete (de lo contrario, los consumer hooks
// fire en paralelo con el snapshot).

import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import i18n from '@/lib/i18n'
import {
  gastosEndpointKeys,
} from '@/features/gastos/use-gastos-endpoints'
import type {
  GastosCalendarSummary,
  GastosCategoriesResponse,
  GastosCategoryWithCount,
  GastosExpenseRow,
  GastosExpensesPage,
  GastosHeroSummary,
} from '@/features/gastos/gastos-endpoints.types'
import {
  markedDaysQueryKey,
  streakQueryKey,
} from '@/features/streaks/use-streak'

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires'

interface RawStreakRow {
  current_streak: number
  longest_streak: number
  total_days_logged: number
  last_logged_date: string | null
  freeze_tokens: number
  streak_broken_at: string | null
}

interface GastosSnapshotPayload {
  hero: GastosHeroSummary
  calendar: GastosCalendarSummary
  categories: GastosCategoriesResponse
  first_page: GastosExpensesPage
  streak_row: RawStreakRow | null
  /** YYYY-MM-DD strings, newest first, max 14 entries. */
  streak_marked_days: string[]
}

interface UseGastosSnapshotArgs {
  familyId?: string
  userId?: string
  cycleStart: Date
  cycleEnd: Date
  today: Date
  cupoDiario: number
  daysPerPage?: number
}

export const gastosSnapshotQueryKey = (
  familyId?: string,
  userId?: string,
  cycleStartIso?: string,
  cycleEndIso?: string,
  todayIso?: string,
  cupoDiario?: number,
  categoryId?: string | null,
) =>
  [
    'gastos-snapshot',
    familyId ?? null,
    userId ?? null,
    cycleStartIso ?? null,
    cycleEndIso ?? null,
    todayIso ?? null,
    cupoDiario ?? 0,
    categoryId ?? null,
  ] as const

function localIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normalizeHero(raw: GastosHeroSummary | null): GastosHeroSummary {
  if (!raw) {
    return {
      total: 0,
      count: 0,
      cycle_days_elapsed: 1,
      average_daily: 0,
      top_categories: [],
      recent_daily_bars: [0, 0, 0, 0, 0, 0, 0],
    }
  }
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

function normalizeExpenseRow(row: GastosExpenseRow): GastosExpenseRow {
  return { ...row, price: Number(row.price ?? 0) }
}

function normalizeCategories(
  raw: GastosCategoriesResponse | null,
): GastosCategoryWithCount[] {
  return (raw?.categories ?? []).map((c) => ({
    ...c,
    count_in_cycle: Number(c.count_in_cycle ?? 0),
  }))
}

function seedCaches(
  client: QueryClient,
  payload: GastosSnapshotPayload,
  args: UseGastosSnapshotArgs,
  cycleStartIso: string,
  cycleEndIso: string,
  todayIso: string,
): void {
  const { familyId, userId, cupoDiario } = args
  if (!familyId) return

  // Hero: misma queryKey que useGastosHeroSummary cuando categoryId=null.
  client.setQueryData(
    gastosEndpointKeys.hero(familyId, cycleStartIso, cycleEndIso, todayIso, null),
    normalizeHero(payload.hero),
  )

  // Calendar: misma queryKey que useGastosCalendarSummary.
  client.setQueryData(
    gastosEndpointKeys.calendar(
      familyId,
      cycleStartIso,
      cycleEndIso,
      todayIso,
      cupoDiario,
      null,
    ),
    payload.calendar ?? { days: [] },
  )

  // Categories: misma queryKey que useGastosCategoriesWithCounts.
  client.setQueryData(
    gastosEndpointKeys.categories(familyId, cycleStartIso, cycleEndIso),
    normalizeCategories(payload.categories),
  )

  // First page del infinite query. La forma esperada por
  // useInfiniteQuery es `{ pages: [...], pageParams: [...] }`. Pasamos
  // null como primer pageParam (= cursor inicial).
  const normalizedFirstPage: GastosExpensesPage = {
    expenses: (payload.first_page?.expenses ?? []).map(normalizeExpenseRow),
    next_cursor: payload.first_page?.next_cursor ?? null,
    has_more: Boolean(payload.first_page?.has_more),
  }
  const seededInfinite: InfiniteData<GastosExpensesPage, string | null> = {
    pages: [normalizedFirstPage],
    pageParams: [null],
  }
  client.setQueryData(
    gastosEndpointKeys.paginated(familyId, cycleStartIso, cycleEndIso, todayIso, null),
    seededInfinite,
  )

  // Streaks: solo seedeamos si tenemos userId (el snapshot ya viene
  // scoped al user actual server-side, pero los queryKeys del cliente
  // incluyen userId para diferenciar múltiples cuentas en un device).
  if (userId) {
    client.setQueryData(streakQueryKey(familyId, userId), payload.streak_row)
    client.setQueryData(
      markedDaysQueryKey(familyId, userId),
      payload.streak_marked_days ?? [],
    )
  }
}

/**
 * Fetcher pelado, exportado por simetría con `useHomeSnapshot.fetchHomeSnapshot`
 * (útil si en el futuro queremos prefetchear desde un layout o ruta).
 */
export async function fetchGastosSnapshot(
  args: UseGastosSnapshotArgs,
): Promise<GastosSnapshotPayload> {
  if (!args.familyId) {
    throw new Error('gastos_snapshot requiere familyId')
  }
  const { data, error } = await supabase.rpc('gastos_snapshot', {
    p_family_id: args.familyId,
    p_cycle_start: args.cycleStart.toISOString(),
    p_cycle_end: args.cycleEnd.toISOString(),
    p_today: localIsoDate(args.today),
    p_cupo_diario: args.cupoDiario,
    p_days_per_page: args.daysPerPage ?? 7,
    p_timezone: DEFAULT_TIMEZONE,
  })
  if (error) throw error
  if (!data) throw new Error(i18n.t('gastos:errors.snapshotEmpty'))
  return data as GastosSnapshotPayload
}

/**
 * Carga el snapshot de Gastos y seedéa las caches consumidas por
 * `useGastosController` y `useStreak`. Gate `<GastosV2ScreenContent>`
 * en `snapshot.data` para que los consumer hooks vean cache hot
 * cuando monten.
 */
export function useGastosSnapshot(args: UseGastosSnapshotArgs) {
  const queryClient = useQueryClient()
  const cycleStartIso = args.cycleStart.toISOString()
  const cycleEndIso = args.cycleEnd.toISOString()
  const todayIso = localIsoDate(args.today)

  return useQuery<GastosSnapshotPayload>({
    queryKey: gastosSnapshotQueryKey(
      args.familyId,
      args.userId,
      cycleStartIso,
      cycleEndIso,
      todayIso,
      args.cupoDiario,
      null,
    ),
    enabled: Boolean(args.familyId),
    // Gastos data cambia más seguido que home (mutations + realtime),
    // pero 60s es suficiente para evitar re-fetches en tab-switches
    // dentro del mismo uso. Mutations específicas y `useGastosRealtime`
    // invalidan los keys hijos, no este snapshot — el snapshot solo se
    // re-fetchea en remount-with-stale.
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    // Si la queryKey cambia (p.ej. cupoDiario se movió ≥1 peso por una
    // mutación/realtime real), mantén la data anterior en pantalla en vez
    // de devolver undefined → el gate `if (!snapshot.data)` NO cae al
    // skeleton, el contenido se queda quieto y la nueva data entra en
    // background. Mata el swap contenido↔skeleton (el "flicker" de Gastos).
    placeholderData: keepPreviousData,
    // On iOS foreground-resume both home_snapshot + gastos_snapshot
    // were re-fetching back-to-back even with staleTime=60s, costing
    // 300-600ms of blocking re-hydration. `staleTime` alone is enough:
    // if the cache is fresh, skip; if stale, the next navigation
    // triggers a refetch naturally.
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: async () => {
      const payload = await fetchGastosSnapshot(args)
      // Seed sincrónicamente dentro del queryFn — los consumer hooks
      // todavía no montaron porque el screen gatea en `snapshot.data`.
      seedCaches(queryClient, payload, args, cycleStartIso, cycleEndIso, todayIso)
      return payload
    },
  })
}

/**
 * Prefetch helper — fires el snapshot RPC + seedea las caches consumer
 * sin requerir que ningún consumer hook esté montado. Lo usa el tabs
 * layout para calentar el cache mientras el user todavía está mirando
 * Home, así cuando tocan Gastos el `<GastosV2ScreenContent>` gate
 * resuelve en 1 frame contra cache hot.
 *
 * Idempotente: si la key ya está en cache fresh (staleTime), no
 * dispara nada · React Query handles dedupe.
 */
export async function prefetchGastosSnapshot(
  client: QueryClient,
  args: UseGastosSnapshotArgs,
): Promise<void> {
  if (!args.familyId) return
  const cycleStartIso = args.cycleStart.toISOString()
  const cycleEndIso = args.cycleEnd.toISOString()
  const todayIso = localIsoDate(args.today)
  await client.prefetchQuery({
    queryKey: gastosSnapshotQueryKey(
      args.familyId,
      args.userId,
      cycleStartIso,
      cycleEndIso,
      todayIso,
      args.cupoDiario,
      null,
    ),
    staleTime: 60_000,
    queryFn: async () => {
      const payload = await fetchGastosSnapshot(args)
      seedCaches(client, payload, args, cycleStartIso, cycleEndIso, todayIso)
      return payload
    },
  })
}
