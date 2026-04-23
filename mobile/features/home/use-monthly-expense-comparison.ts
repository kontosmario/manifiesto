import { useQuery } from '@tanstack/react-query'
import { loadExpenses } from '@/features/expenses/expense-repository'
import {
  computeMonthlyComparison,
  type MonthlyComparison,
} from '@/features/home/home-aggregates.model'

export const monthlyComparisonKey = (familyId?: string) => ['monthly-expense-comparison', familyId ?? null] as const

export function useMonthlyExpenseComparison(familyId?: string) {
  return useQuery<MonthlyComparison>({
    queryKey: monthlyComparisonKey(familyId),
    enabled: Boolean(familyId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!familyId) {
        return { currentMonthTotal: 0, previousMonthTotal: 0, deltaAmount: null, deltaPercent: null, direction: 'flat', previousMonthLabel: '' }
      }
      // load 100d of expenses; enough to cover 2 calendar months
      const since = new Date(); since.setUTCDate(since.getUTCDate() - 70)
      const rows = await loadExpenses(familyId, {})
      const inWindow = rows.filter((r) => new Date(r.created_at).getTime() >= since.getTime())
      return computeMonthlyComparison({ expenses: inWindow.map((e) => ({ price: e.price, created_at: e.created_at })), today: new Date() })
    },
  })
}
