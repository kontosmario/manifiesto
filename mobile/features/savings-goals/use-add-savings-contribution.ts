import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  mapSavingsGoalRow,
  type SavingsGoal,
  type SavingsGoalRow,
} from '@/features/savings-goals/savings-goal.model'
import { savingsGoalQueryKey } from '@/features/savings-goals/use-savings-goal'

interface AddContributionInput {
  goalId: string
  amount: number
}

/**
 * Atomically bumps a savings goal's `current_amount`. Backed by the
 * `add_savings_contribution` RPC so concurrent contributions (two
 * devices, two taps in flight) cannot lose updates the way a
 * read-modify-write client flow could.
 */
export function useAddSavingsContribution(familyId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation<SavingsGoal, Error, AddContributionInput>({
    mutationFn: async ({ goalId, amount }) => {
      const { data, error } = await supabase.rpc('add_savings_contribution', {
        p_goal_id: goalId,
        p_amount: amount,
      })
      if (error) throw error
      if (!data) throw new Error('No se pudo registrar el aporte')
      return mapSavingsGoalRow(data as SavingsGoalRow)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savingsGoalQueryKey(familyId) })
    },
  })
}
