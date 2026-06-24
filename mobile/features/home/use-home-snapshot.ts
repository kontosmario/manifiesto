import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isAvatarSlug, type AvatarSlug } from '@/assets/avatars'
import { profileQueryKey, type Profile } from '@/features/profile/use-profile'
import { familyQueryKey, type FamilyInfo } from '@/features/family/use-family'
import { normalizeAccountKind } from '@/features/family/account-kind'
import {
  familyFinanceQueryKey,
  type FamilyFinance,
} from '@/features/finance/use-family-finance'
import {
  mapFamilyFinanceRecord,
  type FinanceStoragePayload,
} from '@/features/finance/family-finance.model'
import { expenseQueryKeys } from '@/features/expenses/expense-query-keys'
import { fixedExpenseQueryKeys } from '@/features/fixed-expenses/fixed-expense-query-keys'
import {
  mapFixedExpensePaymentRow,
  type FixedExpensePaymentRow,
} from '@/features/fixed-expenses/fixed-expense-payment.model'
import {
  fixedExpenseIdsSignature,
  fixedExpensePaymentsKey,
} from '@/features/fixed-expenses/use-fixed-expense-payments'
import { categoriesQueryKey, type Category } from '@/features/categories/use-categories'
import { familyMembersKey, type FamilyMemberRow } from '@/features/family/use-family-members'
import {
  familyMembersDetailKey,
  type FamilyMemberDetail,
} from '@/features/family/use-family-members-detail'
import { savingsGoalQueryKey } from '@/features/savings-goals/use-savings-goal'
import {
  mapSavingsGoalRow,
  type SavingsGoal,
  type SavingsGoalRow,
} from '@/features/savings-goals/savings-goal.model'
import { notificationQueryKeys } from '@/features/notifications/notification-query-keys'
import { myFamilyRoleQueryKey, type FamilyRole } from '@/features/family/use-my-family-role'
import { pushSubscriptionQueryKey } from '@/features/push/use-push-notifications'
import type { Expense } from '@/features/expenses/expense-repository'
import { asFixedExpense } from '@/features/fixed-expenses/fixed-expense-repository.model'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import { controlIntelligenceQueryKey } from '@/features/insights/use-control-v2-data'
import { seedAdvisorDismissals } from '@/features/insights/control-dismiss-store'

interface RawNotificationSlice {
  id: string
  family_id: string
  user_id: string | null
  title: string | null
  body: string | null
  kind: string | null
  severity: string | null
  created_by: string | null
  created_at: string
  read_at: string | null
  metadata: Record<string, unknown> | null
}

// Raw RPC payload — keys mirror the snake_case columns the RPC builds.
// `fixed_expenses` arrives as raw rows; we pass through `asFixedExpense`
// before seeding to match what the existing hooks expect.
//
// `family` is the raw RPC shape — the persistent family code was
// removed in 20260507000400; the snapshot now returns only
// `{ familyId }`. The client's `FamilyInfo` matches this shape
// exactly, but we keep the explicit mapper for symmetry / future
// shape evolution.
interface RawFamilySlice {
  familyId: string
  kind?: string | null
}

interface HomeSnapshotPayload {
  profile: Profile | null
  family: RawFamilySlice | null
  family_finance: FinanceStoragePayload | null
  fixed_expenses: Array<Record<string, unknown>>
  expenses: Expense[]
  categories_expense: Category[]
  categories_fixed_expense: Category[]
  unread_notification_count: number
  notifications: RawNotificationSlice[]
  family_members: Array<{
    user_id: string
    role: FamilyRole
    blocked_at: string | null
    display_name: string | null
    avatar_animal: string | null
    created_at: string
    /** Optional — only present after migración 20260514020000. Used to
     *  seed `useFamilyMembersDetail` and skip its 2 round-trips. */
    monthly_income_contribution?: number | null
  }>
  savings_goal: SavingsGoalRow | null
  fixed_expense_payments: FixedExpensePaymentRow[]
  has_push_subscription: boolean
  period_month: string
  /** Cycle window the payments slice was scoped against. Optional —
   *  older snapshot RPCs don't return them, in which case the consumer
   *  hook (`useFixedExpensePayments`) falls back to its own fetch. */
  payments_cycle_start?: string | null
  payments_cycle_end?: string | null
  /** Control layer (re-added 2026-05-09 via migración 20260514010000).
   *  Si el RPC todavía no las devuelve (env viejo) las marcamos
   *  optional para no romper el typecheck — el seed las skipea
   *  silenciosamente y los hooks consumidores hacen su fetch directo. */
  monthly_summaries_history?: Array<Record<string, unknown>>
  category_limits?: Array<{
    id: string
    category_id: string
    monthly_cap: number
    warning_threshold_pct: number
  }>
  velocity_today?: {
    snapshot_date: string
    avg_daily_last_7: number
    avg_daily_last_30: number
    momentum: number
    forecast_close_amount: number
    stress_level: string
  } | null
  advisor_signal_dismissals?: Array<{
    signal_id: string
    dismissed_at: string
    ignore_count: number
  }>
  /** Count of streak_marked_days rows for this user in the current
   *  pay cycle. Optional for backwards-compat — clients running
   *  against an RPC that hasn't migrated yet treat undefined as 0.
   *  Added by migración 20260601007000. */
  no_spend_days_count_cycle?: number
  /** ISO date strings (YYYY-MM-DD) of marked no-spend days in the
   *  current cycle, ordered by date desc. Optional for backwards-
   *  compat (see above). Added by migración 20260601007000. */
  no_spend_days_this_cycle?: string[]
  /** Subs (categoría 'Suscripciones', status active) para el check-in de
   *  uso del asistente — derivado server-side SIN ventana de ciclo (ledger
   *  durable). Optional para backwards-compat. Migración 20260623000000. */
  subscription_checkins?: Array<{
    fixed_expense_id: string
    name: string
    amount: number
    last_payment_at: string | null
    last_audit_at: string | null
    recent_levels: Array<'mucho' | 'a_veces' | 'casi_nunca'>
    open_intent: boolean
  }>
}

function toFixedExpenses(
  raw: Array<Record<string, unknown>>,
): FixedExpense[] {
  return (raw ?? []).map((row) => asFixedExpense(row as never))
}

// Mirrors `normalizeRow` from features/notifications/use-notifications —
// can't import it directly because that file also imports a supabase
// client at module load, which would pull circular deps. Keeping a
// small local copy is cleaner.
function normalizeSeverity(
  raw: string | null | undefined,
): 'info' | 'success' | 'warning' | 'alert' {
  switch (raw) {
    case 'success':
    case 'warning':
    case 'alert':
      return raw
    default:
      return 'info'
  }
}

interface NormalizedNotification {
  id: string
  family_id: string
  user_id: string | null
  title: string
  body: string
  kind: string
  severity: 'info' | 'success' | 'warning' | 'alert'
  created_by: string | null
  created_at: string
  read_at: string | null
  metadata: Record<string, unknown>
}

function toNotifications(raw: RawNotificationSlice[]): NormalizedNotification[] {
  return (raw ?? []).map((row) => ({
    id: row.id,
    family_id: row.family_id,
    user_id: row.user_id,
    title: row.title ?? '',
    body: row.body ?? '',
    kind: row.kind ?? 'info',
    severity: normalizeSeverity(row.severity),
    created_by: row.created_by,
    created_at: row.created_at,
    read_at: row.read_at,
    metadata:
      row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
  }))
}

function resolveMyRole(
  members: HomeSnapshotPayload['family_members'],
  userId: string,
): FamilyRole | null {
  const mine = members.find((m) => m.user_id === userId)
  return mine?.role ?? null
}

export { homeSnapshotQueryKey } from '@/features/home/home-snapshot-query-keys'
import { homeSnapshotQueryKey } from '@/features/home/home-snapshot-query-keys'

/**
 * Bare fetcher — calls the RPC and returns the raw payload without
 * seeding any caches. Exported so the tab layout can prefetch the
 * snapshot at mount time (cache warming). Cache seeding happens inside
 * `useHomeSnapshot` where we have access to `queryClient` and `userId`.
 */
export async function fetchHomeSnapshot(): Promise<HomeSnapshotPayload> {
  const { data, error } = await supabase.rpc('home_snapshot')
  if (error) throw error
  if (!data) throw new Error('El snapshot del inicio vino vacío.')
  return data as HomeSnapshotPayload
}

const RECENT_EXPENSES_LIMIT = 6
const MEMBER_COLOR_POOL = ['#2E7D5B', '#E08E63', '#6B3A4F', '#C9A23A', '#4D6FB3', '#8A4D9A']

function toFamilyMemberDetails(
  raw: HomeSnapshotPayload['family_members'],
): FamilyMemberDetail[] {
  return raw.map((m): FamilyMemberDetail => {
    let avatarSlug: AvatarSlug | null = null
    if (typeof m.avatar_animal === 'string' && isAvatarSlug(m.avatar_animal)) {
      avatarSlug = m.avatar_animal
    }
    return {
      userId: m.user_id,
      displayName: m.display_name ?? '',
      avatarSlug,
      monthlyIncomeContribution: Number(m.monthly_income_contribution ?? 0),
    }
  })
}

function toFamilyMemberRows(
  raw: HomeSnapshotPayload['family_members'],
): FamilyMemberRow[] {
  return raw.map((m, i) => {
    let avatarSlug: AvatarSlug | null = null
    if (typeof m.avatar_animal === 'string' && isAvatarSlug(m.avatar_animal)) {
      avatarSlug = m.avatar_animal
    }
    return {
      id: m.user_id,
      // Empty string when display_name is missing — `Avatar` falls
      // back to a person silhouette in that case. Previously this was
      // '—' which rendered as a stranded em dash inside the colored
      // circle (looked like a broken icon).
      name: m.display_name ?? '',
      color: MEMBER_COLOR_POOL[i % MEMBER_COLOR_POOL.length]!,
      avatarSlug,
    }
  })
}

function toSavingsGoal(raw: SavingsGoalRow | null): SavingsGoal | null {
  return raw ? mapSavingsGoalRow(raw) : null
}

function toFamilyFinance(raw: FinanceStoragePayload | null): FamilyFinance {
  if (!raw) {
    // Mirror the repository fallback so consumers don't have to check for null.
    return mapFamilyFinanceRecord(
      {
        daily_budget_buffer_mode: 'none',
        daily_budget_buffer_value: 0,
        daily_budget_checkin_hour: 9,
        daily_budget_nudges_enabled: true,
        monthly_income: 0,
        savings_goal: 0,
        savings_goal_percent: 20,
        usd_exchange_rate: 1,
        salary_payment_day: 1,
        last_salary_confirmed_at: null,
      },
      'fallback',
    )
  }
  return mapFamilyFinanceRecord(raw, 'supabase')
}

/**
 * Seeds every React Query cache that the Home screen depends on with
 * data from a single `home_snapshot()` RPC response. After this runs,
 * all the downstream hooks read from cache and skip their own
 * queries because the cache entry is fresh (within staleTime).
 */
function toFamilyInfo(raw: RawFamilySlice | null): FamilyInfo | null {
  if (!raw) return null
  return { familyId: raw.familyId, kind: normalizeAccountKind(raw.kind) }
}

/**
 * Seed the profile cache from a snapshot payload SIN pisar columnas que el RPC
 * no devuelve. El payload de home_snapshot omite las 4 `*_tour_seen_at`, así que
 * un overwrite plano las dejaba `undefined` → `useToursSeen` las leía como
 * "visto" (`undefined !== null`) y las visitas guiadas nunca arrancaban en una
 * cuenta nueva (regresión 2026-06-23). El merge sobre el perfil completo ya
 * cacheado las mantiene vivas a través del reseed; `useMyProfile` sigue siendo
 * la fuente de lo que el snapshot no trae. Mismo patrón que use-timezone-sync.
 */
function seedProfile(
  client: QueryClient,
  userId: string,
  profile: Profile | null,
): void {
  if (!profile) {
    client.setQueryData(profileQueryKey(userId), null)
    return
  }
  client.setQueryData<Profile | null>(profileQueryKey(userId), (prev) => {
    if (!prev) return profile
    return {
      ...prev,
      ...profile,
      // `onboarding_completed_at` lo owna SOLO `useMyProfile`, no el
      // snapshot. El RPC home_snapshot puede traerlo STALE (null) si corrió
      // antes de que el wizard completara — `upsertFinance`/bootstrap en el
      // último paso disparan un refetch de home_snapshot cuyo profile todavía
      // tiene null, y ESE refetch resuelve DESPUÉS del setQueryData(truthy) de
      // `completeOnboarding`. El overwrite plano revertía el flag → el gate de
      // la ruta de onboarding re-montaba el wizard en el step 1 por un frame
      // antes del success (parpadeo 2026-06-24). Conservando el valor previo,
      // el reseed nunca DEGRADA el flag; los cambios reales (incluido el
      // reset → null) llegan por el refetch de `useMyProfile`. Mismo espíritu
      // que el merge de las `*_tour_seen_at` arriba.
      onboarding_completed_at: prev.onboarding_completed_at,
    }
  })
}

function seedCaches(
  client: QueryClient,
  payload: HomeSnapshotPayload,
  userId: string,
  familyId: string,
): void {
  seedProfile(client, userId, payload.profile ?? null)
  // The RPC returns `{ familyId, code }`; the client's `useFamily`
  // expects `{ familyId, familyCode }`. Normalize before seeding so
  // consumers read the right shape on the cache hit.
  client.setQueryData(familyQueryKey(userId), toFamilyInfo(payload.family))

  client.setQueryData(
    familyFinanceQueryKey(familyId),
    toFamilyFinance(payload.family_finance),
  )

  client.setQueryData(
    fixedExpenseQueryKeys.family(familyId),
    toFixedExpenses(payload.fixed_expenses),
  )

  client.setQueryData(expenseQueryKeys.list(familyId, undefined), payload.expenses)
  // Recent activity feed para Home: filtra commitment_id ANTES de slicear.
  // Bug histórico: si los 6 más recientes eran 5 fijos auto-pagados + 1
  // gasto manual, el filter client-side dejaba solo 1 row visible (todo
  // commitment_id se descarta porque vive en la vista de Fijos, no acá).
  // Pre-filtrar el seed acá garantiza que el primer paint de Home tenga
  // 6 gastos manuales si el dataset los tiene. `payload.expenses` viene
  // con limit 120 desde home_snapshot SQL — buffer suficiente para
  // sobrevivir días con cascada de fijos pagados.
  client.setQueryData(
    expenseQueryKeys.recent(familyId, RECENT_EXPENSES_LIMIT),
    payload.expenses
      .filter((e) => !(e as { commitment_id?: string | null }).commitment_id)
      .slice(0, RECENT_EXPENSES_LIMIT),
  )

  client.setQueryData(categoriesQueryKey(familyId, 'expense'), payload.categories_expense)
  client.setQueryData(
    categoriesQueryKey(familyId, 'fixed_expense'),
    payload.categories_fixed_expense,
  )

  client.setQueryData(
    notificationQueryKeys.unreadCount(familyId, userId),
    payload.unread_notification_count,
  )
  // Seed the top-80 notifications list so notifications-screen opens
  // with zero extra requests. Key format matches
  // `useFamilyNotifications(familyId, userId, 80)`.
  client.setQueryData(
    notificationQueryKeys.list(familyId, userId, 80),
    toNotifications(payload.notifications),
  )

  client.setQueryData(familyMembersKey(familyId), toFamilyMemberRows(payload.family_members))

  // Seed `useFamilyMembersDetail` (advisor host + settings + family-admin).
  // Only when the snapshot includes `monthly_income_contribution` per
  // member (migración 20260514020000+). Sin el campo, dejamos que el
  // hook haga su fetch directo — backwards compatible.
  if (
    payload.family_members.some(
      (m) => m.monthly_income_contribution !== undefined,
    )
  ) {
    client.setQueryData(
      familyMembersDetailKey(familyId),
      toFamilyMemberDetails(payload.family_members),
    )
  }

  client.setQueryData(
    myFamilyRoleQueryKey(userId, familyId),
    resolveMyRole(payload.family_members, userId),
  )

  client.setQueryData(
    pushSubscriptionQueryKey(familyId, userId),
    Boolean(payload.has_push_subscription),
  )

  client.setQueryData(savingsGoalQueryKey(familyId), toSavingsGoal(payload.savings_goal))

  // Seed `useFixedExpensePayments` IF the snapshot returns the cycle
  // window it scoped the payments against. Older RPCs (pre
  // 20260501020000) only return `period_month` (calendar) — in that
  // case the hook keys never match and we skip the seed, fall back to
  // the consumer's own fetch.
  if (payload.payments_cycle_start && payload.payments_cycle_end) {
    // Signature de fixed expense ids debe matchear con la que arma el
    // consumer hook (`useFixedExpensePayments`). El consumer pasa
    // `fixedExpenses.map(f => f.id)`; replicamos lo mismo acá usando
    // los rows crudos del payload para que la key sea idéntica.
    const idsSignature = fixedExpenseIdsSignature(
      payload.fixed_expenses
        .map((row) => (row as { id?: string }).id)
        .filter((id): id is string => typeof id === 'string'),
    )
    client.setQueryData(
      fixedExpensePaymentsKey(
        familyId,
        payload.payments_cycle_start,
        payload.payments_cycle_end,
        idsSignature,
      ),
      (payload.fixed_expense_payments ?? []).map(mapFixedExpensePaymentRow),
    )
  }

  // ─── Control layer seed (re-added 2026-05-09) ──────────────────────
  // home_snapshot ahora incluye 4 keys que antes el cliente fetcheaba
  // por separado (3 round-trips a monthly_summaries / category_limits /
  // velocity_snapshots vía useControlIntelligence + 1 a
  // advisor_signal_dismissals vía useAdvisorDismissalsSync). Sembrando
  // las caches con los datos del snapshot, esos 4 round-trips quedan
  // suprimidos en cold-start.
  //
  // Si el RPC en este env todavía no devuelve estas keys (env viejo
  // pre-migración 20260514010000), el seed se skipea y los hooks
  // consumidores caen al fetch directo — backwards compatible.
  if (
    payload.monthly_summaries_history !== undefined ||
    payload.category_limits !== undefined ||
    payload.velocity_today !== undefined
  ) {
    client.setQueryData(controlIntelligenceQueryKey(familyId), {
      summaries: payload.monthly_summaries_history ?? [],
      limits: payload.category_limits ?? [],
      velocity: payload.velocity_today ?? null,
    })
  }

  if (payload.advisor_signal_dismissals !== undefined) {
    seedAdvisorDismissals(
      payload.advisor_signal_dismissals.map((row) => ({
        signalId: row.signal_id,
        dismissedAt: new Date(row.dismissed_at).getTime(),
        ignoreCount: row.ignore_count,
      })),
      userId,
      familyId,
    )
  }
}

/**
 * Shared queryFn body: fetch the snapshot RPC + seed every dependent
 * cache. Used by both `useHomeSnapshot` (app shell) and
 * `prefetchHomeSnapshot` (unlock screen warm-up) so both paths seed
 * identically and React Query dedupes them onto one in-flight request.
 */
async function fetchAndSeedHomeSnapshot(
  queryClient: QueryClient,
  userId: string | undefined,
): Promise<HomeSnapshotPayload> {
  const payload = await fetchHomeSnapshot()
  // Seed synchronously inside the queryFn so the individual caches
  // are populated before consumer components re-render and mount
  // their own hooks. Doing this in a useEffect would lose the race.
  if (userId && payload.family?.familyId) {
    seedCaches(queryClient, payload, userId, payload.family.familyId)
  } else if (userId) {
    // No family yet — still seed profile + family (as null) so
    // RequireAuth can redirect without refetching.
    seedProfile(queryClient, userId, payload.profile ?? null)
    queryClient.setQueryData(familyQueryKey(userId), toFamilyInfo(payload.family))
  }
  return payload
}

const HOME_SNAPSHOT_STALE_TIME_MS = 60_000

/**
 * Warm the home snapshot cache ahead of navigation. Called from the
 * unlock screen the moment it mounts, so the RPC round-trip runs in
 * parallel with the Face ID prompt (~2s of user interaction) instead
 * of serially after it. By the time the user authenticates, the
 * snapshot is (usually) already cached and `DESTINATION_READY`
 * fires within the home screen's first commit.
 *
 * `prefetchQuery` is a no-op when fresh data already exists, and if
 * `useHomeSnapshot` mounts while this is in flight both share the
 * same request (same query key). Errors are swallowed by design —
 * the app-shell `useHomeSnapshot` retains error handling/retry.
 */
export function prefetchHomeSnapshot(
  queryClient: QueryClient,
  userId: string,
): Promise<void> {
  return queryClient.prefetchQuery({
    queryKey: homeSnapshotQueryKey(userId),
    staleTime: HOME_SNAPSHOT_STALE_TIME_MS,
    queryFn: () => fetchAndSeedHomeSnapshot(queryClient, userId),
  })
}

/**
 * Loads every slice the Home screen needs in one round-trip and seeds
 * the individual query caches. Gate your Home render on
 * `snapshot.isSuccess` so sub-hooks mount with hot caches and don't
 * fire their own requests.
 */
export function useHomeSnapshot(userId?: string) {
  const queryClient = useQueryClient()

  return useQuery<HomeSnapshotPayload>({
    queryKey: homeSnapshotQueryKey(userId),
    enabled: Boolean(userId),
    staleTime: HOME_SNAPSHOT_STALE_TIME_MS,
    gcTime: 5 * 60_000,
    // On iOS foreground-resume both home_snapshot + gastos_snapshot
    // were re-fetching back-to-back even with staleTime=60s, costing
    // 300-600ms of blocking re-hydration. `staleTime` alone is enough:
    // if the cache is fresh, skip; if stale, the next navigation
    // triggers a refetch naturally.
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: () => fetchAndSeedHomeSnapshot(queryClient, userId),
  })
}
