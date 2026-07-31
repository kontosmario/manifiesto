import { RequireAuth } from '@/components/guards'
import { RiseViewGate } from '@/components/home/animated/rise-view'
import { LayoutTransitionGateProvider } from '@/hooks/use-layout-transition-gate'
import { NeoFijosScreen } from '@/screens/home/neo/neo-fijos-screen'

export default function FixedExpensesRoute() {
  // See expenses.tsx: gate the RiseView entrances so the pre-mounted,
  // detached tab renders settled on its first native attach instead of
  // snapping/animating in (the "first-load jolt"). The
  // LayoutTransitionGateProvider does the same for `LinearTransition`
  // (hero card, rows, category headers) — see useGatedLayout.
  //
  // Fijos con la piel del rediseño, aprobada por el owner el 2026-07-30. SIN
  // `preview`: ese prop existe para la ruta dev, donde la Fijos vieja seguía
  // montada en paralelo (`freezeOnBlur:false` → efectos vivos) y los dos
  // registros del mismo tour se pisaban. Acá la neo es la única, así que el
  // tour corre.
  return (
    <RequireAuth>
      {({ familyId, userId }) => (
        <RiseViewGate skip>
          <LayoutTransitionGateProvider label="Fijos">
            <NeoFijosScreen familyId={familyId} userId={userId} />
          </LayoutTransitionGateProvider>
        </RiseViewGate>
      )}
    </RequireAuth>
  )
}
