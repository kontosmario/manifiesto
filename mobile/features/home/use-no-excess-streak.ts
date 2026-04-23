import { useQuery } from '@tanstack/react-query'
import { loadExpenses } from '@/features/expenses/expense-repository'
import { computeNoExcessStreak } from '@/features/home/home-aggregates.model'

export const noExcessStreakKey = (familyId?: string) => ['no-excess-streak', familyId ?? null] as const

export function useNoExcessStreak(params: { familyId?: string; dailyBudget: number | null; today?: Date }) {
  return useQuery<number>({
    queryKey: noExcessStreakKey(params.familyId),
    enabled: Boolean(params.familyId) && params.dailyBudget != null,
    staleTime: 30_000,
    queryFn: async () => {
      if (!params.familyId) return 0
      const rows = await loadExpenses(params.familyId, {})
      return computeNoExcessStreak({
        expenses: rows.map((e) => ({ price: e.price, created_at: e.created_at })),
        dailyBudget: params.dailyBudget,
        today: params.today ?? new Date(),
      })
    },
  })
}
