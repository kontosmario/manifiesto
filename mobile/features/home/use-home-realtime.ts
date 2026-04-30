// Realtime subscriptions for the Home tab. Thin wrapper around the
// generic `useFamilyRealtime` helper — keeps the call sites readable
// and the table → invalidator map declarative.

import { expenseQueryKeys } from '@/features/expenses/expense-query-keys'
import { fixedExpenseQueryKeys } from '@/features/fixed-expenses/fixed-expense-query-keys'
import { savingsGoalQueryKey } from '@/features/savings-goals/use-savings-goal'
import { notificationQueryKeys } from '@/features/notifications/notification-query-keys'
import { useFamilyRealtime } from '@/features/family/use-family-realtime'

export function useHomeRealtime(familyId?: string) {
  useFamilyRealtime({
    familyId,
    scope: 'home',
    listeners: {
      expenses: (qc, fid) => {
        void qc.invalidateQueries({ queryKey: expenseQueryKeys.family(fid) })
        void qc.invalidateQueries({ queryKey: expenseQueryKeys.recentFamily(fid) })
      },
      fixed_expenses: (qc, fid) => {
        void qc.invalidateQueries({ queryKey: fixedExpenseQueryKeys.family(fid) })
      },
      savings_goals: (qc, fid) => {
        void qc.invalidateQueries({ queryKey: savingsGoalQueryKey(fid) })
      },
      notifications: (qc, fid) => {
        void qc.invalidateQueries({ queryKey: notificationQueryKeys.family(fid) })
      },
    },
  })
}
