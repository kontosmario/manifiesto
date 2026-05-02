import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fixedExpenseQueryKeys } from '@/features/fixed-expenses/fixed-expense-query-keys'
import { subscriptionsZombieQueryKeys } from './query-keys'
import type { IntentResolution } from './types'

interface Variables {
  intentId: string
  resolution: IntentResolution
  newAmount?: number
}

export function useResolveSubscriptionIntent(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: Variables) => {
      const { data, error } = await supabase.rpc('resolve_subscription_intent', {
        p_intent_id: input.intentId,
        p_resolution: input.resolution,
        p_new_amount: input.newAmount ?? null,
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
