import { RequireAuth } from '@/components/guards'
import { RiseViewGate } from '@/components/home/animated/rise-view'
import { LayoutTransitionGateProvider } from '@/hooks/use-layout-transition-gate'
import { NeoGastosScreen } from '@/screens/home/neo/neo-gastos-screen'

// ⚠️ SWAP TEMPORAL DE MEDICIÓN (2026-07-23) — NO es el swap definitivo.
// La Gastos neo se venía probando desde Settings→Dev, una ruta montada ENCIMA
// de las tabs: con `freezeOnBlur:false` la Gastos vieja y la Home neo quedaban
// vivas y animando debajo, así que se medía "una pantalla contra tres apiladas"
// y ninguna optimización se notaba. Montándola acá se mide TAB CONTRA TAB,
// en igualdad de condiciones con la vieja.
// `preview` queda en false (default) a propósito: es la configuración real
// (realtime + telemetría + tour + mutaciones vivas). En preview el header NO
// monta los TourTarget, así que medir con preview subestimaría el costo.
// REVERTIR: restaurar el import de `@/screens/home/expenses-screen` y volver a
// <ExpensesScreen/>. El gate de aprobación sigue en 'gastos':'pendiente'.

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
          <LayoutTransitionGateProvider label="Gastos">
            <NeoGastosScreen familyId={familyId} userId={userId} />
          </LayoutTransitionGateProvider>
        </RiseViewGate>
      )}
    </RequireAuth>
  )
}
