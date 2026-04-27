import { RequireAuth } from '@/components/guards'
import { ControlV2Screen } from '@/screens/home/control-v2-screen'

/**
 * Control tab route.
 *
 * PHASE 1 (now): ControlV2Screen renders the new design on top of a
 * local mock dataset, so the visuals can be refined without waiting
 * for backend wiring. The old `InsightsScreen` + controller remain
 * in the repo so we can drop them back in for PHASE 2 by replacing
 * the import — their `useControlSnapshot` plumbing is ready to use.
 */
export default function InsightsRoute() {
  return (
    <RequireAuth>
      {({ familyId, userId }) => (
        <ControlV2Screen familyId={familyId} userId={userId} />
      )}
    </RequireAuth>
  )
}
