import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import i18n from '@/lib/i18n'
import {
  mapSavingsGoalRow,
  type SavingsGoal,
  type SavingsGoalRow,
} from '@/features/savings-goals/savings-goal.model'
import { savingsGoalQueryKey } from '@/features/savings-goals/use-savings-goal'
import { latestSavingsGoalQueryKey } from '@/features/savings-goals/use-latest-savings-goal'
import { syncAllAfterMutation } from '@/lib/sync-after-mutation'

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
export function useAddSavingsContribution(
  familyId: string | undefined,
  userId?: string,
) {
  const queryClient = useQueryClient()

  return useMutation<SavingsGoal, Error, AddContributionInput>({
    mutationFn: async ({ goalId, amount }) => {
      const { data, error } = await supabase.rpc('add_savings_contribution', {
        p_goal_id: goalId,
        p_amount: amount,
      })
      if (error) throw error
      if (!data) throw new Error(i18n.t('settings:savingsGoalValidation.contributionFailed'))
      return mapSavingsGoalRow(data as SavingsGoalRow)
    },
    onSuccess: (updated) => {
      // Optimistic-seed la query activa Y la latest con la goal recién
      // actualizada; evita un blink mientras el invalidate refetcha.
      // Code review M6 mobile FIX-ROUND: latest también la consume
      // Settings (incluye inactivas) y quedaba stale hasta el refetch.
      if (familyId) {
        queryClient.setQueryData(savingsGoalQueryKey(familyId), updated)
        queryClient.setQueryData(latestSavingsGoalQueryKey(familyId), updated)
      }
    },
    // Code review H3 (sprint A, 2026-06-08): un aporte mueve el chip
    // de Home (savings card), Control v2 (alcancía + meta), y dispara
    // cycle-acumulado si el aporte es del ciclo en curso. Antes
    // invalidábamos solo `savingsGoalQueryKey`; ahora delegamos a
    // `syncAllAfterMutation` con scope `savings` para que todas las
    // vistas reaccionen en sincronía.
    onSettled: () => {
      void syncAllAfterMutation(queryClient, {
        familyId,
        userId,
        scopes: ['savings'],
      })
    },
  })
}
