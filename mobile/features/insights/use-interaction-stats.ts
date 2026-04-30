// Memory Layer — read-side hook.
//
// Reads the per-user `advisor_interactions` log and aggregates it via
// the pure helpers in `signal-family.ts`. Pure functions live there so
// tests can exercise them without dragging in the supabase client.
//
// The hook returns sensible empty-state defaults when the migration
// is pending or the call fails — builders that consume
// `InteractionStats` gracefully degrade ("planner" persona, no
// modulation).

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  aggregateInteractionStats,
  EMPTY_INTERACTION_STATS,
  type InteractionStats,
} from '@/features/insights/signal-family'

interface InteractionRow {
  signal_family: string
  outcome: string
  time_to_action_ms: number | null
  created_at: string
}

const STALE_TIME = 5 * 60_000

export function useInteractionStats(userId: string | null | undefined) {
  return useQuery<InteractionStats>({
    queryKey: ['advisor-interaction-stats', userId ?? null] as const,
    enabled: Boolean(userId),
    staleTime: STALE_TIME,
    queryFn: async () => {
      if (!userId) return EMPTY_INTERACTION_STATS
      try {
        const { data, error } = await supabase
          .from('advisor_interactions')
          .select('signal_family, outcome, time_to_action_ms, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(2000)
        if (error) {
          // Table may not exist yet (migration pending). Degrade silently.
          return EMPTY_INTERACTION_STATS
        }
        return aggregateInteractionStats((data ?? []) as InteractionRow[])
      } catch {
        return EMPTY_INTERACTION_STATS
      }
    },
  })
}

// Re-exports so existing callers keep working without churn.
export {
  signalFamilyOf,
  aggregateInteractionStats,
  type InteractionStats,
  type SignalFamilyStats,
} from '@/features/insights/signal-family'
