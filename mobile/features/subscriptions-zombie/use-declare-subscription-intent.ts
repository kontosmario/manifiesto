import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fixedExpenseQueryKeys } from '@/features/fixed-expenses/fixed-expense-query-keys'
import { subscriptionsZombieQueryKeys } from './query-keys'
import type { IntentKind } from './types'

interface Variables {
  fixedExpenseId: string
  intent: IntentKind
  notes?: string
}

export function useDeclareSubscriptionIntent(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: Variables) => {
      const { data, error } = await supabase.rpc('declare_subscription_intent', {
        p_fixed_expense_id: input.fixedExpenseId,
        p_intent: input.intent,
        p_notes: input.notes ?? null,
      })
      if (error) throw error
      return data
    },
    onSettled: async () => {
      if (!familyId) return
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: subscriptionsZombieQueryKeys.feed(familyId),
        }),
        queryClient.invalidateQueries({
          queryKey: fixedExpenseQueryKeys.family(familyId),
        }),
      ])
    },
  })
}
