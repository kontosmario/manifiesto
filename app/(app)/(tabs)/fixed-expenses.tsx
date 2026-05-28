import { RequireAuth } from '@/components/guards'
import { RiseViewGate } from '@/components/home/animated/rise-view'
import { FijosV2Screen } from '@/screens/home/fijos-v2-screen'

export default function FixedExpensesRoute() {
  // See expenses.tsx: gate the RiseView entrances so the pre-mounted,
  // detached tab renders settled on its first native attach instead of
  // snapping/animating in (the "first-load jolt").
  return (
    <RequireAuth>
      {({ familyId }) => (
        <RiseViewGate skip>
          <FijosV2Screen familyId={familyId} />
        </RiseViewGate>
      )}
    </RequireAuth>
  )
}
