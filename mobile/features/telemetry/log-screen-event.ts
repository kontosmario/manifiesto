// Generic wrapper para telemetría cross-screen (gastos, settings, etc).
//
// Routea por la misma queue compartida que `logHomeEvent`, así múltiples
// eventos disparados en cold-start de una pantalla terminan en una
// única RPC `log_home_events_bulk`. La tabla backing (`home_telemetry`)
// guarda event/element como strings arbitrarios, así que esta misma
// plumbing sirve para todos los tabs — el nombre RPC es legacy.

import { enqueueTelemetryEvent } from '@/features/telemetry/event-queue'

interface LogArgs {
  familyId: string
  /** Dotted event id, e.g. `"gastos.opened"`, `"gastos.element_tapped"`. */
  event: string
  elementId?: string | null
  slot?: string | null
  context?: Record<string, unknown>
}

export async function logScreenEvent(args: LogArgs): Promise<void> {
  enqueueTelemetryEvent({
    family_id: args.familyId,
    event: args.event,
    element_id: args.elementId ?? null,
    slot: args.slot ?? null,
    context: args.context ?? {},
  })
}
