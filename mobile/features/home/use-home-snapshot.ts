import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isAvatarSlug, type AvatarSlug } from '@/assets/avatars'
import { profileQueryKey, type Profile } from '@/features/profile/use-profile'
import { familyQueryKey, type FamilyInfo } from '@/features/family/use-family'
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
import { type FixedExpensePaymentRow } from '@/features/fixed-expenses/fixed-expense-payment.model'
import { categoriesQueryKey, type Category } from '@/features/categories/use-categories'
import { familyMembersKey, type FamilyMemberRow } from '@/features/family/use-family-members'
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
interface HomeSnapshotPayload {
  profile: Profile | null
  family: FamilyInfo | null
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
  }>
  savings_goal: SavingsGoalRow | null
  fixed_expense_payments: FixedExpensePaymentRow[]
  has_push_subscription: boolean
  period_month: string
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

export const homeSnapshotQueryKey = (userId?: string) =>
  ['home-snapshot', userId ?? null] as const

const RECENT_EXPENSES_LIMIT = 6
const MEMBER_COLOR_POOL = ['#2E7D5B', '#E08E63', '#6B3A4F', '#C9A23A', '#4D6FB3', '#8A4D9A']

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
      name: m.display_name ?? '—',
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
function seedCaches(
  client: QueryClient,
  payload: HomeSnapshotPayload,
  userId: string,
  familyId: string,
): void {
  client.setQueryData(profileQueryKey(userId), payload.profile ?? null)
  client.setQueryData(familyQueryKey(userId), payload.family ?? null)

  client.setQueryData(
    familyFinanceQueryKey(familyId),
    toFamilyFinance(payload.family_finance),
  )

  client.setQueryData(
    fixedExpenseQueryKeys.family(familyId),
    toFixedExpenses(payload.fixed_expenses),
  )

  client.setQueryData(expenseQueryKeys.list(familyId, undefined), payload.expenses)
  client.setQueryData(
    expenseQueryKeys.recent(familyId, RECENT_EXPENSES_LIMIT),
    payload.expenses.slice(0, RECENT_EXPENSES_LIMIT),
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

  client.setQueryData(
    myFamilyRoleQueryKey(userId, familyId),
    resolveMyRole(payload.family_members, userId),
  )

  client.setQueryData(
    pushSubscriptionQueryKey(familyId, userId),
    Boolean(payload.has_push_subscription),
  )

  client.setQueryData(savingsGoalQueryKey(familyId), toSavingsGoal(payload.savings_goal))

  // Fixed-expense payments are no longer seeded here — the consumer
  // hook keys by pay-cycle window (start/end ISO), not by calendar
  // period_month returned from the snapshot, so any seed would never
  // match the hook's key. The hook issues a single fetch on mount.
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
    // Inherits the global `staleTime: 30_000`. That keeps the snapshot
    // fresh long enough that a second observer (e.g. HomeScreen) can
    // subscribe without triggering a redundant refetch. Pull-to-refresh
    // still works via explicit `snapshot.refetch()`.
    queryFn: async () => {
      const { data, error } = await supabase.rpc('home_snapshot')
      if (error) throw error
      if (!data) throw new Error('El snapshot del inicio vino vacío.')
      const payload = data as HomeSnapshotPayload
      // Seed synchronously inside the queryFn so the individual caches
      // are populated before consumer components re-render and mount
      // their own hooks. Doing this in a useEffect would lose the race.
      if (userId && payload.family?.familyId) {
        seedCaches(queryClient, payload, userId, payload.family.familyId)
      } else if (userId) {
        // No family yet — still seed profile + family (as null) so
        // RequireAuth can redirect without refetching.
        queryClient.setQueryData(profileQueryKey(userId), payload.profile ?? null)
        queryClient.setQueryData(familyQueryKey(userId), payload.family ?? null)
      }
      return payload
    },
  })
}
