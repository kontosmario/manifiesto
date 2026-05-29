import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  controlIntelligenceQueryKey,
  type ControlIntelligencePayload,
} from '@/features/insights/use-control-v2-data'

/**
 * Marca el "Manifiesto Wrapped" de un cierre como visto (RPC
 * `mark_cycle_wrapped_seen`). Update optimista: setea `wrapped_seen_at`
 * en la summary cacheada para que el pulse de discoverability del header
 * se apague al instante, y revalida desde el server al settle.
 */
export function useMarkCycleWrappedSeen(familyId?: string) {
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
            s.id === summaryId ? { ...s, wrapped_seen_at: s.wrapped_seen_at ?? nowIso } : s,
          ),
        })
      }
      return { previous }
    },
    onError: (_err, _summaryId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}
