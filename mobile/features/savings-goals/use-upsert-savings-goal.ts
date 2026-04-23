import { useMutation, useQueryClient } from '@tanstack/react-query'
import { upsertSavingsGoal } from '@/features/savings-goals/savings-goal.repository'
import { savingsGoalQueryKey } from '@/features/savings-goals/use-savings-goal'
import type { SavingsGoal, SavingsGoalInput } from '@/features/savings-goals/savings-goal.model'

export function useUpsertSavingsGoal(familyId: string) {
  const queryClient = useQueryClient()
  return useMutation<SavingsGoal, Error, { input: SavingsGoalInput; existingId: string | null }>({
    mutationFn: ({ input, existingId }) => upsertSavingsGoal(familyId, input, existingId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savingsGoalQueryKey(familyId) })
    },
  })
}
