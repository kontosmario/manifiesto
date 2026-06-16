import { RequireAuth } from '@/components/guards'
import { RiseViewGate } from '@/components/home/animated/rise-view'
import { LayoutTransitionGateProvider } from '@/hooks/use-layout-transition-gate'
import { ControlV2Screen } from '@/screens/home/control-v2-screen'

// Control tab route — renders ControlV2Screen.
export default function InsightsRoute() {
  // See expenses.tsx: gate the RiseView entrances so the pre-mounted,
  // detached tab renders settled on its first native attach instead of
  // snapping/animating in (the "first-load jolt"). LayoutTransitionGate
  // does the same for raw `entering`/`LinearTransition` in the hero.
  return (
    <RequireAuth>
      {({ familyId, userId }) => (
        <RiseViewGate skip>
          <LayoutTransitionGateProvider label="Control">
            <ControlV2Screen familyId={familyId} userId={userId} />
          </LayoutTransitionGateProvider>
        </RiseViewGate>
      )}
    </RequireAuth>
  )
}
