import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  controlIntelligenceQueryKey,
  type ControlIntelligencePayload,
} from '@/features/insights/use-control-v2-data'
import { syncAllAfterMutation } from '@/lib/sync-after-mutation'

/**
 * Marca el "Manifiesto Wrapped" de un cierre como visto (RPC
 * `mark_cycle_wrapped_seen`). Update optimista: setea `wrapped_seen_at`
 * en la summary cacheada para que el pulse de discoverability del header
 * se apague al instante, y revalida vía `syncAllAfterMutation` (que
 * además invalida el home_snapshot root — necesario para que el re-seed
 * no clobberee el flag, ver migración 20260529140000).
 */
export function useMarkCycleWrappedSeen(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()
  const key = controlIntelligenceQueryKey(familyId)

  return useMutation({
    mutationFn: async (summaryId: string) => {
      const { error } = await supabase.rpc('mark_cycle_wrapped_seen', {
        p_summary_id: summaryId,
      })
      if (error) throw error
    },
    onMutate: async (summaryId: string) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<ControlIntelligencePayload>(key)
      if (previous) {
        const nowIso = new Date().toISOString()
        queryClient.setQueryData<ControlIntelligencePayload>(key, {
          ...previous,
          summaries: previous.summaries.map((s) =>
            s.id === summaryId
              ? { ...s, wrapped_seen_at: s.wrapped_seen_at ?? nowIso }
              : s,
          ),
        })
      }
      return { previous }
    },
    onError: (_err, _summaryId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous)
      }
      // Sin toast: marcar visto es un side-effect, no una acción del user
      // que necesite feedback. Si falla, el siguiente intento (próximo
      // tap o refetch desde DB) corrige.
    },
    onSettled: () => {
      void syncAllAfterMutation(queryClient, {
        familyId,
        userId,
        scopes: ['wrapped'],
      })
    },
  })
}
