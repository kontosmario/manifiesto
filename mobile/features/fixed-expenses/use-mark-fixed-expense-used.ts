import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fixedExpenseQueryKeys } from '@/features/fixed-expenses/fixed-expense-query-keys'
import { supabase } from '@/lib/supabase'

/**
 * "Usada hoy" mutation — writes the current timestamp to
 * `fixed_expenses.last_used_at` for a single fixed expense, then
 * invalidates the fixed-expenses cache so the UI re-reads.
 *
 * Why this exists: `cron_detect_zombies` flags subscription-style
 * periodic fijos whose `last_used_at` is null OR older than 60 days.
 * Without this mutation, every subscription would eventually look
 * dormant. The user confirms usage from the Fijo row — that's the
 * only signal we have for "you're still using it".
 */
export function useMarkFixedExpenseUsed(familyId: string) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationKey: ['fixed-expenses', 'mark-used', familyId],
    mutationFn: async (fixedExpenseId: string) => {
      const { error } = await supabase
        .from('fixed_expenses')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', fixedExpenseId)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: fixedExpenseQueryKeys.family(familyId),
      })
    },
  })
}
