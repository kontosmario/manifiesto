// Client wrapper for the `log_home_event` RPC.
//
// Fire-and-forget telemetry for the Home tab. Each event captures one
// interaction (mount, unmount, element shown, element tapped, etc.)
// against the `home_telemetry` table via a SECURITY DEFINER RPC that
// validates family membership server-side.
//
// Reuses the pattern established by `log-advisor-interaction.ts`:
// errors are swallowed (telemetry must never break foreground UX),
// the call is `void`-prefixed at every consumer to discourage `await`
// in render paths.

import { supabase } from '@/lib/supabase'

/** Eight surface slots the Home renders into — referenced from the
 *  slot map (`docs/home-sprint-0-slot-map.md`). Used to attribute
 *  events to a stable position rather than a component name (which can
 *  change when slots are reused). */
export type HomeSlot = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8'

export type HomeEvent =
  | 'home.opened'
  | 'home.closed'
  | 'home.element_shown'
  | 'home.element_tapped'
  | 'home.element_dismissed'
  | 'home.scrolled_to_bottom'
  | 'home.refreshed'
  | 'home.left_without_tap'
  | 'home.reopened_in_session'

/** Stable, kebab-case identifiers for every Home element we measure.
 *  Adding a new element requires adding it here so analytics queries
 *  stay typo-resistant — the union type forces compile-time checks. */
export type HomeElementId =
  // Header buttons
  | 'header_bell'
  | 'header_settings'
  | 'header_assistant'
  // Family strip
  | 'payday_pill'
  | 'family_avatar'
  // Hero
  | 'hero_card'
  | 'hero_setup_cta'
  // Month summary
  | 'month_summary_variables'
  | 'month_summary_fixed'
  // Meta card
  | 'meta_card'
  | 'meta_quick_add'
  | 'meta_empty_card'
  // Activity
  | 'activity_view_all'
  | 'activity_row'
  | 'activity_empty_cta'
  // Trust receipt
  | 'trust_receipt_strip'
  // Future Sprint elements (reserved ids — keep in sync with slot map)
  | 'top_category_chip'
  | 'next_fixed_chip'
  | 'forecast_summary'
  | 'contextual_banner'

interface LogArgs {
  familyId: string
  event: HomeEvent
  elementId?: HomeElementId
  slot?: HomeSlot
  /** Free-form context. Common keys: `session_id`, `dwell_ms`,
   *  `ms_since_shown`, `destination_route`, `gap_ms`, `reason`. */
  context?: Record<string, unknown>
}

export async function logHomeEvent(args: LogArgs): Promise<void> {
  try {
    await supabase.rpc('log_home_event', {
      p_family_id: args.familyId,
      p_event: args.event,
      p_element_id: args.elementId ?? null,
      p_slot: args.slot ?? null,
      p_context: args.context ?? {},
    })
  } catch {
    // Telemetry must never break the foreground UX. Failures here
    // include: RPC not deployed yet, network drop, RLS denial, auth
    // expired. All resolve in noise on the next session.
  }
}
