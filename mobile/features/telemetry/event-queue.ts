// Shared queue + debounced bulk flush for telemetry events.
//
// Both `logHomeEvent` (home tab) and `logScreenEvent` (rest of the app)
// route through this queue so multiple events that fire in quick
// succession (cold-start mount, user tapping multiple chips) end up
// inside a single `log_home_events_bulk` RPC call instead of N
// separate `log_home_event` calls.
//
// Backwards compat: if the bulk RPC isn't deployed in this env (older
// Supabase backend), the flush falls back to per-event `log_home_event`
// calls. Telemetry must never break the foreground UX, so all errors
// are swallowed.

import { supabase } from '@/lib/supabase'

export interface QueuedTelemetryEvent {
  family_id: string
  event: string
  element_id: string | null
  slot: string | null
  context: Record<string, unknown>
}

const FLUSH_DEBOUNCE_MS = 50
const FLUSH_FORCED_AT = 20

let queue: QueuedTelemetryEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

async function flushBulk(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (queue.length === 0) return
  const batch = queue
  queue = []
  try {
    const { error } = await supabase.rpc('log_home_events_bulk', {
      p_events: batch,
    })
    if (error) {
      // Bulk RPC missing or rejected → fallback per-event para el batch
      // (preserva telemetry sin perder eventos). Log silenciado.
      await Promise.allSettled(
        batch.map((e) =>
          supabase.rpc('log_home_event', {
            p_family_id: e.family_id,
            p_event: e.event,
            p_element_id: e.element_id,
            p_slot: e.slot,
            p_context: e.context,
          }),
        ),
      )
    }
  } catch {
    // Telemetry never breaks foreground UX.
  }
}

function scheduleFlush(): void {
  if (queue.length >= FLUSH_FORCED_AT) {
    void flushBulk()
    return
  }
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushBulk()
  }, FLUSH_DEBOUNCE_MS)
}

export function enqueueTelemetryEvent(event: QueuedTelemetryEvent): void {
  queue.push(event)
  scheduleFlush()
}

/** Force-flush la cola — útil para tests o para garantizar entrega
 *  antes de que el JS context muera. */
export async function flushTelemetryQueue(): Promise<void> {
  await flushBulk()
}
