import { RequireAuth } from '@/components/guards'
import { RiseViewGate } from '@/components/home/animated/rise-view'
import { LayoutTransitionGateProvider } from '@/hooks/use-layout-transition-gate'
import { NeoControlScreen } from '@/screens/home/neo/neo-control-screen'

// Control tab route — monta la vista NEO del rediseño (swap 2026-08-03,
// handoff design_handoff_control; pedido directo del owner de integrarla
// de punta a punta). La pantalla vieja (ControlV2Screen) queda en código
// para rollback rápido: revertir este import es el rollback completo.
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
            <NeoControlScreen familyId={familyId} userId={userId} />
          </LayoutTransitionGateProvider>
        </RiseViewGate>
      )}
    </RequireAuth>
  )
}
