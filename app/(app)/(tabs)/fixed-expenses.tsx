import { RequireAuth } from '@/components/guards'
import { RiseViewGate } from '@/components/home/animated/rise-view'
import { LayoutTransitionGateProvider } from '@/hooks/use-layout-transition-gate'
import { FijosV2Screen } from '@/screens/home/fijos-v2-screen'

export default function FixedExpensesRoute() {
  // See expenses.tsx: gate the RiseView entrances so the pre-mounted,
  // detached tab renders settled on its first native attach instead of
  // snapping/animating in (the "first-load jolt"). The
  // LayoutTransitionGateProvider does the same for `LinearTransition`
  // (hero card, rows, category headers) — see useGatedLayout.
  return (
    <RequireAuth>
      {({ familyId, userId }) => (
        <RiseViewGate skip>
          <LayoutTransitionGateProvider label="Fijos">
            <FijosV2Screen familyId={familyId} userId={userId} />
          </LayoutTransitionGateProvider>
        </RiseViewGate>
      )}
    </RequireAuth>
  )
}
