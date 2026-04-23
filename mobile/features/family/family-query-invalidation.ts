import type { QueryClient } from '@tanstack/react-query'
import { expenseQueryKeys } from '@/features/expenses/expense-query-keys'
import { fixedExpenseQueryKeys } from '@/features/fixed-expenses/fixed-expense-query-keys'
import { notificationQueryKeys } from '@/features/notifications/notification-query-keys'

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
  ]

  if (includeFixedExpenses) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: fixedExpenseQueryKeys.family(familyId) }),
    )
  }

  if (includeNotifications) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.family(familyId) }),
    )
  }

  await Promise.all(invalidations)
}
