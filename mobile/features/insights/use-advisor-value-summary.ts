// Read-side hook for the `advisor_value_summary` view.
//
// The view aggregates `advisor_value_log` per (user, family) and is
// surfaced in the "Trust Receipt" UI as the asistente's running tally
// of value delivered. Like the rest of the cognitive layer, this hook
// degrades gracefully when the migration is pending — returning a
// zero summary so the surface can stay mounted without crashing.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface AdvisorValueSummary {
  totalSavedLifetime: number
  savedQuarter: number
  savedMonth: number
  totalActions: number
  distinctSignalFamilies: number
}

const EMPTY_SUMMARY: AdvisorValueSummary = {
  totalSavedLifetime: 0,
  savedQuarter: 0,
  savedMonth: 0,
  totalActions: 0,
  distinctSignalFamilies: 0,
}

interface SummaryRow {
  total_saved_lifetime: string | number | null
  saved_quarter: string | number | null
  saved_month: string | number | null
  total_actions: number | null
  distinct_signal_families: number | null
}

function num(value: string | number | null | undefined): number {
  if (value == null) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const STALE_TIME = 10 * 60_000

export function useAdvisorValueSummary(
  userId: string | null | undefined,
  familyId: string | null | undefined,
) {
  return useQuery<AdvisorValueSummary>({
    queryKey: ['advisor-value-summary', userId ?? null, familyId ?? null] as const,
    enabled: Boolean(userId && familyId),
    staleTime: STALE_TIME,
    queryFn: async () => {
      if (!userId || !familyId) return EMPTY_SUMMARY
      try {
        const { data, error } = await supabase
          .from('advisor_value_summary')
          .select(
            'total_saved_lifetime, saved_quarter, saved_month, total_actions, distinct_signal_families',
          )
          .eq('user_id', userId)
          .eq('family_id', familyId)
          .maybeSingle<SummaryRow>()
        if (error || !data) return EMPTY_SUMMARY
        return {
          totalSavedLifetime: num(data.total_saved_lifetime),
          savedQuarter: num(data.saved_quarter),
          savedMonth: num(data.saved_month),
          totalActions: data.total_actions ?? 0,
          distinctSignalFamilies: data.distinct_signal_families ?? 0,
        }
      } catch {
        return EMPTY_SUMMARY
      }
    },
  })
}
