import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { syncAllAfterMutation } from '@/lib/sync-after-mutation'
import { subscriptionsZombieQueryKeys } from './query-keys'
import type { IntentResolution } from './types'

interface Variables {
  intentId: string
  resolution: IntentResolution
  newAmount?: number
}

// userId requerido para que syncAllAfterMutation invalide home_snapshot —
// sin él, el banner del Home / hero quedan stale post-resolución porque el
// snapshot embebe fixed_expenses. CR v3 finding I1 (2026-06-08).
export function useResolveSubscriptionIntent(familyId?: string, userId?: string) {
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
        syncAllAfterMutation(queryClient, {
          familyId,
          userId,
          scopes: ['fixed', 'fixedPayment'],
        }),
      ])
    },
  })
}
