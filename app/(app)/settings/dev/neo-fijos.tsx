import { Redirect } from 'expo-router'
import { RequireAuth } from '@/components/guards'

// FIJOS neo (FASE F2): el kit del rediseño cableado con DATOS REALES,
// accesible SOLO por esta ruta dev. Fijos está PENDIENTE de aprobación
// (redesign-approval-status: 'fijos') → nunca se cablea a la tab live hasta
// el swap post-aprobación del owner.
// require() dentro del branch __DEV__: Metro constant-foldea y la neo-screen
// no entra al bundle de release.
//
// `preview`: la Fijos vieja sigue montada en la tab (freezeOnBlur:false →
// efectos vivos); con `preview` la neo desactiva lo side-effectful que
// colisiona (el tour, en la fase 3). El swap monta el MISMO componente SIN
// `preview` (default false) y todo corre.
//
// OJO — las escrituras de esta pantalla son REALES contra la base: el CTA
// "confirmar cobro" del estado E8 y (desde la fase 3) marcar pagado /
// revertir. Marcar/revertir es reversible; confirmar cobro NO lo es desde
// acá y además descongela el saldo de Home.
export default function Page() {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NeoFijosScreen } = require('@/screens/home/neo/neo-fijos-screen') as typeof import('@/screens/home/neo/neo-fijos-screen')
    return (
      <RequireAuth>
        {({ familyId, userId }) => (
          <NeoFijosScreen familyId={familyId} userId={userId} preview />
        )}
      </RequireAuth>
    )
  }
  return <Redirect href="/(app)/settings" />
}
