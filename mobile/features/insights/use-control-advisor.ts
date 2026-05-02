// DORMANT — the app uses the local `control-signals.ts` engine to
// power the "Asistente Financiero" card without hitting an LLM.
// This hook remains available in case we want to re-introduce an
// LLM pass in a future sprint (e.g. for richer natural-language
// summaries). The `supabase/functions/control-advisor` Edge Function
// still ships with the app and can be deployed independently; this
// hook is the mobile client for it.
//
// Do not import this from the Control screen unless you're wiring
// the LLM path back in — the screen currently consumes `signals`
// directly from `useControlV2Data`.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'

interface AdvisorResponse {
  tasks: ControlAdvisorTask[]
  generatedAt?: string
  cached?: boolean
  fallback?: boolean
  reason?: string
}

export const controlAdvisorQueryKey = (familyId?: string) =>
  ['control-advisor', familyId ?? null] as const

/**
 * @deprecated Dormant — the live Control screen consumes signals
 * directly from `useControlV2Data`. Kept for future LLM-pass work.
 */
export function useControlAdvisor(
  familyId: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery<AdvisorResponse>({
    queryKey: controlAdvisorQueryKey(familyId),
    enabled: Boolean(familyId) && options.enabled !== false,
    staleTime: 4 * 60 * 60 * 1000, // 4 hours
    gcTime: 12 * 60 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<AdvisorResponse>(
        'control-advisor',
        {
          body: { familyId },
        },
      )
      if (error) throw error
      if (!data) return { tasks: [] }
      return data
    },
  })
}
