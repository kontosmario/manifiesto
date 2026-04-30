import { useQuery } from '@tanstack/react-query'
import { fetchActiveSavingsGoal } from '@/features/savings-goals/savings-goal.repository'
import type { SavingsGoal } from '@/features/savings-goals/savings-goal.model'

export const savingsGoalQueryKey = (familyId?: string) => ['savings-goal', familyId ?? null] as const

export function useSavingsGoal(familyId?: string) {
  return useQuery<SavingsGoal | null>({
    queryKey: savingsGoalQueryKey(familyId),
    enabled: Boolean(familyId),
    // Savings goal changes via mutation (which invalidates the key
    // explicitly), so silent refetches add nothing. Bumped from 60s.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!familyId) return null
      return fetchActiveSavingsGoal(familyId)
    },
  })
}
