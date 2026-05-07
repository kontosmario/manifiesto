import { useMemo } from 'react'
import { useExpenses } from '@/features/expenses/use-expenses'
import {
  computeMonthlyComparison,
  type MonthlyComparison,
} from '@/features/home/home-aggregates.model'

const EMPTY: MonthlyComparison = {
  currentMonthTotal: 0,
  previousMonthTotal: 0,
  deltaAmount: null,
  deltaPercent: null,
  direction: 'flat',
  previousMonthLabel: '',
}

/**
 * Derived from the already-cached `['expenses', familyId]` slice (seeded by
 * `useHomeSnapshot` on Home mount). No extra network fetch. Shape of the
 * return value mirrors the old `useQuery<MonthlyComparison>` so consumers
 * don't have to change. `isLoading` tracks the underlying expenses query.
 */
export function useMonthlyExpenseComparison(familyId?: string) {
  const expensesQuery = useExpenses(familyId)
  const expensesData = expensesQuery.data

  const data = useMemo<MonthlyComparison>(() => {
    if (!familyId) return EMPTY
    const rows = expensesData ?? []
    const since = new Date()
    since.setUTCDate(since.getUTCDate() - 70)
    // Variable gastos only — fixed expense payments are auto-recorded
    // entries that don't represent user spend behaviour, so they
    // shouldn't tint the month-over-month comparison shown on the
    // Gastos hero card.
    const inWindow = rows.filter(
      (r) =>
        !r.commitment_id &&
        new Date(r.created_at).getTime() >= since.getTime(),
    )
    return computeMonthlyComparison({
      expenses: inWindow.map((e) => ({ price: e.price, created_at: e.created_at })),
      today: new Date(),
    })
  }, [familyId, expensesData])

  return {
    data,
    isLoading: expensesQuery.isLoading,
    isError: expensesQuery.isError,
    error: expensesQuery.error,
  }
}

