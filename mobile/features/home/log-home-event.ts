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

// ─── Bulk batching ───────────────────────────────────────────────────
//
// Cold-start del home dispara N eventos en pocos ms (home.opened +
// home.element_shown × N elementos). Cada uno disparaba un RPC
// separado → red mostraba 3-7 calls a /rest/v1/rpc/log_home_event en
// paralelo, server-load redundante.
//
// Cola interna + flush debounced: cada `logHomeEvent` encola; la
// próxima vez que el event-loop esté libre (microtask via setTimeout 50ms
// o cuando la cola supera 20 eventos), todos los pendientes se mandan
// en una sola llamada al RPC bulk `log_home_events_bulk`. El backend
// hace UN insert masivo a `home_telemetry`. Mantiene la API
// fire-and-forget original; consumers no cambian.
//
// Si el RPC bulk no está deployado (env viejo), fallback a per-event
// individual — el catch del rpc swallow del original mantiene
// resilience telemetry-must-not-break-UX.

interface QueuedEvent {
  family_id: string
  event: string
  element_id: string | null
  slot: string | null
  context: Record<string, unknown>
}

const FLUSH_DEBOUNCE_MS = 50
const FLUSH_FORCED_AT = 20

let queue: QueuedEvent[] = []
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
      // Bulk RPC missing or rejected → fallback per-event para el
      // batch (preserva telemetry sin perder eventos). Log silenciado.
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

export async function logHomeEvent(args: LogArgs): Promise<void> {
  queue.push({
    family_id: args.familyId,
    event: args.event,
    element_id: args.elementId ?? null,
    slot: args.slot ?? null,
    context: args.context ?? {},
  })
  scheduleFlush()
}

/**
 * Forzar el flush inmediato de la cola — útil para tests o cuando
 * la app está por unmountear y queremos garantizar que los eventos
 * pendientes lleguen antes de que el JS context muera.
 */
export async function flushHomeEventQueue(): Promise<void> {
  await flushBulk()
}
