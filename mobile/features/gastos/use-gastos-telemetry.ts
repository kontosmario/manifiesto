// Session-lifecycle telemetry for the Gastos tab. Thin wrapper over
// the generic `useScreenTelemetry` so the Gastos screen has the same
// event surface as Home: opened / closed / left_without_tap /
// reopened_in_session, plus per-element shown/tapped via children
// that consume `sessionId`.

import { useScreenTelemetry } from '@/features/telemetry/use-screen-telemetry'

export function useGastosTelemetry(familyId: string | undefined) {
  return useScreenTelemetry({ scope: 'gastos', familyId })
}
