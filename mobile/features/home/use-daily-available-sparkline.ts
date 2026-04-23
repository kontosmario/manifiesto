import { useQuery } from '@tanstack/react-query'
import { loadExpenses } from '@/features/expenses/expense-repository'
import { buildDailyAvailableSparkline } from '@/features/home/home-aggregates.model'

export const dailyAvailableSparklineKey = (familyId?: string) => ['daily-available-sparkline', familyId ?? null] as const

export function useDailyAvailableSparkline(params: {
  familyId?: string
  cycleStart: Date | null
  totalAvailable: number
  today?: Date
}) {
  return useQuery<number[] | null>({
    queryKey: dailyAvailableSparklineKey(params.familyId),
    enabled: Boolean(params.familyId) && !!params.cycleStart,
    staleTime: 30_000,
    queryFn: async () => {
      if (!params.familyId || !params.cycleStart) return null
      const rows = await loadExpenses(params.familyId, {})
      return buildDailyAvailableSparkline({
        expenses: rows.map((e) => ({ price: e.price, created_at: e.created_at })),
        cycleStart: params.cycleStart,
        totalAvailable: params.totalAvailable,
        today: params.today ?? new Date(),
      })
    },
  })
}
