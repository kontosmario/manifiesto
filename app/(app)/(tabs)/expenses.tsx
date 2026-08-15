import { RequireAuth } from '@/components/guards'
import { RiseViewGate } from '@/components/home/animated/rise-view'
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
  //
  // Este gate es DURO y la pantalla monta otro adentro con
  // `skip={reduceMotion}`. Hasta el 2026-08-12 el interno pisaba a este (el
  // `RiseView` lee el proveedor más cercano), así que en hardware normal esta
  // línea no hacía nada; ahora `RiseViewGate` compone con el de arriba y las
  // dos intenciones conviven.
  //
  // SIN `LayoutTransitionGateProvider` (se sacó el 2026-08-12): NINGÚN
  // consumidor de `useGatedLayout` cuelga de la Gastos neo — los de
  // `components/gastos/*` los monta la pantalla vieja (`gastos-v2-screen`, ya
  // no ruteada). Montarlo igual costaba un re-render de todo el subárbol 1,5 s
  // después de cada visita (el fallback que abre el gate) para nadie. Si
  // alguna vez se agrega un `LinearTransition` gateado acá, hay que volver a
  // montarlo — sin provider el default es "gate abierto", que reintroduce el
  // warp del primer attach en silencio.
  return (
    <RequireAuth>
      {({ familyId, userId }) => (
        <RiseViewGate skip>
          <NeoGastosScreen familyId={familyId} userId={userId} />
        </RiseViewGate>
      )}
    </RequireAuth>
  )
}
