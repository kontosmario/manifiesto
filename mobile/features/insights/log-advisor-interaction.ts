// Client wrapper for the `log_advisor_interaction` RPC.
//
// Fire-and-forget: the dispatcher and the surface layers call this
// every time a user is shown a signal (`shown_only`), acts on its CTA
// (`acted`), dismisses it (`dismissed`), or it expires from view
// (`expired`). Failures are swallowed — telemetry must never break the
// foreground UX.
//
// While the migration `20260501000000_advisor_memory_layer.sql` is
// pending, every call here will fail silently and return without
// surfacing the error. Once the table is live the same calls become
// load-bearing.

import { supabase } from '@/lib/supabase'
import { signalFamilyOf } from '@/features/insights/signal-family'

export type AdvisorOutcome =
  | 'shown_only'
  | 'acted'
  | 'dismissed'
  | 'expired'
  | 'blocked'

export type AdvisorSurface =
  | 'control_card'
  | 'asistente_screen'
  | 'push_notification'

interface LogArgs {
  familyId: string
  signalId: string
  outcome: AdvisorOutcome
  surface: AdvisorSurface
  /** Free-form context (confidence, urgency, impactRaw, dow, hour). */
  context?: Record<string, unknown>
  /** Only meaningful when outcome === 'acted'. */
  timeToActionMs?: number
}

export async function logAdvisorInteraction(args: LogArgs): Promise<void> {
  try {
    await supabase.rpc('log_advisor_interaction', {
      p_family_id: args.familyId,
      p_signal_id: args.signalId,
      p_signal_family: signalFamilyOf(args.signalId),
      p_outcome: args.outcome,
      p_surface: args.surface,
      p_context: args.context ?? {},
      p_time_to_action_ms: args.timeToActionMs ?? null,
    })
  } catch {
    // Swallow — telemetry failures must never break the dispatcher.
  }
}
