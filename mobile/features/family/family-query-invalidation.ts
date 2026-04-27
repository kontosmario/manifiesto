import type { QueryClient } from '@tanstack/react-query'
import { expenseQueryKeys } from '@/features/expenses/expense-query-keys'
import { fixedExpenseQueryKeys } from '@/features/fixed-expenses/fixed-expense-query-keys'
import { notificationQueryKeys } from '@/features/notifications/notification-query-keys'

// Streak rows live on a `(familyId, userId)` prefix; invalidate the
// whole family prefix and the expenses-advance trigger refetches.
const userStreakFamilyKey = (familyId?: string) => ['user-streak', familyId ?? null] as const
// Marked-days ledger same shape — the auto-revert trigger may have
// dropped today's row, so the UI needs to re-pull it to hide the
// "Hoy sin gastos" card automatically.
const streakMarkedDaysFamilyKey = (familyId?: string) =>
  ['streak-marked-days', familyId ?? null] as const

interface InvalidateFamilyBudgetDataOptions {
  includeFixedExpenses?: boolean
  includeNotifications?: boolean
}

export async function invalidateFamilyBudgetData(
  queryClient: QueryClient,
  familyId?: string,
  options: InvalidateFamilyBudgetDataOptions = {},
) {
  const { includeFixedExpenses = false, includeNotifications = false } = options

  const invalidations = [
    queryClient.invalidateQueries({ queryKey: expenseQueryKeys.family(familyId) }),
    queryClient.invalidateQueries({ queryKey: expenseQueryKeys.recentFamily(familyId) }),
    queryClient.invalidateQueries({ queryKey: expenseQueryKeys.total(familyId) }),
    queryClient.invalidateQueries({ queryKey: expenseQueryKeys.periodTotalFamily(familyId) }),
    queryClient.invalidateQueries({ queryKey: expenseQueryKeys.monthlySpentFamily(familyId) }),
    // The expenses trigger advances public.user_streaks — refresh that cache
    // so the flame icon and sheet reflect the new counter/tokens immediately.
    queryClient.invalidateQueries({ queryKey: userStreakFamilyKey(familyId) }),
    // Same trigger auto-deletes today's "no spending" mark when a real
    // expense lands — invalidate so the revert UI dismisses on its own.
    queryClient.invalidateQueries({ queryKey: streakMarkedDaysFamilyKey(familyId) }),
  ]

  if (includeFixedExpenses) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: fixedExpenseQueryKeys.family(familyId) }),
      // Paying / deleting a fijo mutates `fixed_expense_payments`; invalidate
      // every period so the Fijos aggregate (paid/pending/overdue) refreshes.
      queryClient.invalidateQueries({
        queryKey: fixedExpenseQueryKeys.paymentsFamily(familyId),
      }),
    )
  }

  if (includeNotifications) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.family(familyId) }),
    )
  }

  await Promise.all(invalidations)
}
