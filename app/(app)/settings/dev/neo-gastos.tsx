import { Redirect } from 'expo-router'
import { RequireAuth } from '@/components/guards'

// GASTOS neo (FASES F0 + F1): pantalla del rediseño cableada con DATOS
// REALES (ciclo actual read-only), accesible SOLO por esta ruta dev. Gastos
// está PENDIENTE de aprobación (redesign-approval-status: 'gastos') → nunca
// se cablea a la tab live hasta el swap de F6 (post-aprobación owner).
// require() dentro del branch __DEV__: Metro constant-foldea y la neo-screen
// no entra al bundle de release.
//
// `preview`: la Gastos vieja sigue montada en la tab (freezeOnBlur:false →
// efectos vivos); con `preview` la neo desactivará lo side-effectful que
// colisiona (realtime/telemetría/tour, en F6). El swap monta el mismo
// componente SIN `preview` (default false) y todo corre.
export default function Page() {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NeoGastosScreen } = require('@/screens/home/neo/neo-gastos-screen') as typeof import('@/screens/home/neo/neo-gastos-screen')
    return (
      <RequireAuth>
        {({ familyId, userId }) => (
          <NeoGastosScreen familyId={familyId} userId={userId} preview />
        )}
      </RequireAuth>
    )
  }
  return <Redirect href="/(app)/settings" />
}
