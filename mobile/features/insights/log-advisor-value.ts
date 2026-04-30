// Client wrapper for the `log_advisor_value` RPC.
//
// Counterfactual value capture — when a user takes an action via an
// advisor CTA, we record the estimated monthly value the action will
// realize. The Trust Receipt UI consumes the aggregated view to prove
// "I saved you $X this quarter" rather than just listing more
// suggestions.
//
// Fire-and-forget: failures are swallowed (the migration may be
// pending; the foreground UX must never break on telemetry). Each
// `action_taken` aligns with a specific signal family so the dashboard
// can pivot by category.

import { supabase } from '@/lib/supabase'
import { signalFamilyOf } from '@/features/insights/signal-family'

export type AdvisorValueAction =
  | 'cancelled_zombie'
  | 'reduced_category'
  | 'moved_to_savings'
  | 'renegotiated_hike'
  | 'avoided_overspend'
  | 'completed_goal'

interface LogValueArgs {
  familyId: string
  signalId: string
  actionTaken: AdvisorValueAction
  /** Estimated monthly value (ARS). Will be multiplied by `horizonMonths`
   *  in the lifetime-saved aggregate. Must be ≥ 0. */
  valueSaved: number
  /** Default 12 months — i.e. annualize a recurring saving. Pass 1
   *  for one-shot recoveries, e.g. avoided overspend. */
  horizonMonths?: number
  /** JSON evidence the dashboard can render (price before/after, the
   *  zombie sub name, the goal title, etc.). */
  evidence?: Record<string, unknown>
  /** When the user explicitly confirmed the value (e.g. tapped
   *  "Yes, I cancelled the sub") set false; default true (estimated). */
  isEstimated?: boolean
}

export async function logAdvisorValue(args: LogValueArgs): Promise<void> {
  if (!Number.isFinite(args.valueSaved) || args.valueSaved < 0) return
  try {
    await supabase.rpc('log_advisor_value', {
      p_family_id: args.familyId,
      p_signal_id: args.signalId,
      p_signal_family: signalFamilyOf(args.signalId),
      p_action_taken: args.actionTaken,
      p_value_saved: Math.round(args.valueSaved),
      p_value_horizon_months: args.horizonMonths ?? 12,
      p_evidence: args.evidence ?? {},
      p_is_estimated: args.isEstimated ?? true,
    })
  } catch {
    // Swallow — telemetry must never break the dispatcher.
  }
}
