import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { subscriptionsZombieQueryKeys } from './query-keys'
import type { UsageLevel } from './types'

interface Variables {
  fixedExpenseId: string
  level: UsageLevel
}

export function useRecordSubscriptionAudit(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: Variables) => {
      const { data, error } = await supabase.rpc('audit_subscription', {
        p_fixed_expense_id: input.fixedExpenseId,
        p_level: input.level,
      })
      if (error) throw error
      return data
    },
    onSettled: async () => {
      if (!familyId) return
      await queryClient.invalidateQueries({
        queryKey: subscriptionsZombieQueryKeys.feed(familyId),
      })
    },
  })
}
