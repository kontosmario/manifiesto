import { useQuery } from '@tanstack/react-query'
import { loadExpenses } from '@/features/expenses/expense-repository'
import { computeMonthDailyMood, type DayMood } from '@/features/home/home-aggregates.model'

export const monthDailyMoodKey = (familyId?: string) => ['month-daily-mood', familyId ?? null] as const

export function useMonthDailyMood(params: { familyId?: string; dailyBudget: number | null; today?: Date }) {
  return useQuery<Record<number, DayMood>>({
    queryKey: monthDailyMoodKey(params.familyId),
    enabled: Boolean(params.familyId) && params.dailyBudget != null,
    staleTime: 60_000,
    queryFn: async () => {
      if (!params.familyId) return {}
      const rows = await loadExpenses(params.familyId, {})
      return computeMonthDailyMood({
        expenses: rows.map((e) => ({ price: e.price, created_at: e.created_at })),
        dailyBudget: params.dailyBudget,
        today: params.today ?? new Date(),
      })
    },
  })
}
