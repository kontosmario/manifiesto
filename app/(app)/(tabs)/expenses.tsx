import { RequireAuth } from '@/components/guards'
import { RiseViewGate } from '@/components/home/animated/rise-view'
import { ExpensesScreen } from '@/screens/home/expenses-screen'

export default function ExpensesRoute() {
  // Tabs are pre-mounted (lazy:false) but detached while inactive, so a
  // navigated-to tab's content is laid out at its FINAL state behind the
  // scenes; the RiseView `entering` only fires on the first native
  // attach (first visit), snapping the already-settled content back to
  // its start frame and animating it — the "first-load jolt". Gating the
  // entrances renders this screen settled from the start (matching the
  // instant tab switch). Home keeps its entrance: it's the active tab at
  // boot, a clean fresh mount with no snap.
  return (
    <RequireAuth>
      {({ familyId, userId }) => (
        <RiseViewGate skip>
          <ExpensesScreen familyId={familyId} userId={userId} />
        </RiseViewGate>
      )}
    </RequireAuth>
  )
}
