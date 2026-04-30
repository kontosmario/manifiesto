// Generic wrapper around the `log_home_event` RPC. The table backing
// it (`home_telemetry`) stores arbitrary event/element strings, so
// the same plumbing serves all tabs. The RPC name itself is legacy —
// when it gets renamed in a future migration the wrapper API stays
// stable and consumers don't change.

import { supabase } from '@/lib/supabase'

interface LogArgs {
  familyId: string
  /** Dotted event id, e.g. `"gastos.opened"`, `"gastos.element_tapped"`. */
  event: string
  elementId?: string | null
  slot?: string | null
  context?: Record<string, unknown>
}

export async function logScreenEvent(args: LogArgs): Promise<void> {
  try {
    await supabase.rpc('log_home_event', {
      p_family_id: args.familyId,
      p_event: args.event,
      p_element_id: args.elementId ?? null,
      p_slot: args.slot ?? null,
      p_context: args.context ?? {},
    })
  } catch {
    // Telemetry must never break the foreground UX.
  }
}
