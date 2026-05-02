// Fallback gate for `useControlV2Data`.
//
// When `usingMock === true` the user is brand-new (no income configured
// or zero expenses) and we used to serve `CONTROL_MOCK.tareas` — three
// fake tasks referencing Disney+, Edenor and a fictitious "Ocio"
// overspend. Real users perceived these as their own data.
//
// New contract: `signals` is empty during the mock window. UI
// consumers (asistente-screen, home tab badge) already render empty
// states correctly when `signals.length === 0`.

import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'

export interface ResolveControlSignalsInput {
  usingMock: boolean
  computedSignals: ControlAdvisorTask[]
}

export function resolveControlSignals(
  input: ResolveControlSignalsInput,
): ControlAdvisorTask[] {
  if (input.usingMock) return []
  return input.computedSignals
}
