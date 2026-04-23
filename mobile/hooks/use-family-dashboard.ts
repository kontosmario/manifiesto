import { useMemo } from 'react'
import type { Expense } from '@/features/expenses/use-expenses'
import { useExpenses } from '@/features/expenses/use-expenses'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { buildFamilyDashboardSnapshot } from '@/features/family/family-dashboard-model'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import { useFixedExpenses } from '@/features/fixed-expenses/use-fixed-expenses'

const EMPTY_EXPENSES: Expense[] = []
const EMPTY_COMMITMENTS: FixedExpense[] = []

export function useFamilyDashboard(familyId?: string) {
  const familyFinanceQuery = useFamilyFinance(familyId)
  const fixedExpensesQuery = useFixedExpenses(familyId)
  const expensesQuery = useExpenses(familyId)
  const expenses = expensesQuery.data ?? EMPTY_EXPENSES
  const commitments = fixedExpensesQuery.data ?? EMPTY_COMMITMENTS
  const dashboardError =
    familyFinanceQuery.error ?? fixedExpensesQuery.error ?? expensesQuery.error ?? null
  const snapshot = useMemo(
    () =>
      buildFamilyDashboardSnapshot({
        commitments,
        expenses,
        finance: familyFinanceQuery.data,
      }),
    [commitments, expenses, familyFinanceQuery.data],
  )

  return {
    familyFinanceQuery,
    fixedExpensesQuery,
    expensesQuery,
    dashboardError,
    isLoadingDashboard:
      familyFinanceQuery.isLoading || fixedExpensesQuery.isLoading || expensesQuery.isLoading,
    monthlyHistoryIsLoading: expensesQuery.isLoading,
    refetchAll: async () => {
      await Promise.all([
        familyFinanceQuery.refetch(),
        fixedExpensesQuery.refetch(),
        expensesQuery.refetch(),
      ])
    },
    ...snapshot,
  }
}

export type FamilyDashboard = ReturnType<typeof useFamilyDashboard>
