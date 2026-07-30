import { useCallback, useMemo } from 'react'
import type { Expense } from '@/features/expenses/use-expenses'
import { useExpenses } from '@/features/expenses/use-expenses'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { buildFamilyDashboardSnapshot } from '@/features/family/family-dashboard-model'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import { useFixedExpenses } from '@/features/fixed-expenses/use-fixed-expenses'
import { useMonthlyAccounting } from '@/hooks/use-monthly-accounting'

const EMPTY_EXPENSES: Expense[] = []
const EMPTY_COMMITMENTS: FixedExpense[] = []

export function useFamilyDashboard(familyId?: string) {
  const familyFinanceQuery = useFamilyFinance(familyId)
  const fixedExpensesQuery = useFixedExpenses(familyId)
  const expensesQuery = useExpenses(familyId)
  const monthlyAccounting = useMonthlyAccounting(familyId)
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
        today: monthlyAccounting.today,
        monthlyAccounting,
      }),
    [commitments, expenses, familyFinanceQuery.data, monthlyAccounting],
  )

  // PERF · `refetchAll` era una arrow NUEVA en cada render. Como se propaga a
  // `useGastosController.refetchAll` (que la lleva en sus deps), contaminaba la
  // identidad de ese callback y, por transitividad, la de cualquier handler que
  // lo cerrara. Los `.refetch()` de RQ v5 ya son ref-estables por query.
  const refetchAll = useCallback(async () => {
    await Promise.all([
      familyFinanceQuery.refetch(),
      fixedExpensesQuery.refetch(),
      expensesQuery.refetch(),
    ])
  }, [familyFinanceQuery, fixedExpensesQuery, expensesQuery])

  // PERF · el objeto de retorno también era un literal nuevo por render. Lo
  // consumen pantallas que lo bajan por props (Home, Gastos) y hooks que lo
  // toman en deps; con identidad estable esos memos dejan de recomputar por
  // renders que no movieron ningún dato.
  return useMemo(
    () => ({
      familyFinanceQuery,
      fixedExpensesQuery,
      expensesQuery,
      dashboardError,
      isLoadingDashboard:
        familyFinanceQuery.isLoading || fixedExpensesQuery.isLoading || expensesQuery.isLoading,
      monthlyHistoryIsLoading: expensesQuery.isLoading,
      refetchAll,
      ...snapshot,
    }),
    [familyFinanceQuery, fixedExpensesQuery, expensesQuery, dashboardError, refetchAll, snapshot],
  )
}

export type FamilyDashboard = ReturnType<typeof useFamilyDashboard>
