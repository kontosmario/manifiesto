import { Redirect } from 'expo-router'
import { RequireAuth } from '@/components/guards'

// HOME neo (FASE 3): pantalla live nueva montada con DATOS REALES,
// accesible SOLO por esta ruta dev hasta el swap de F4 (que cambia el
// import de app/(app)/(tabs)/home.tsx). require() dentro del branch
// __DEV__: Metro constant-foldea y la neo-screen no entra al bundle de
// release hasta el swap.
//
// `preview`: en esta ruta la Home vieja sigue montada en la tab
// (freezeOnBlur:false → efectos vivos). Con `preview` la neo NO corre lo
// side-effectful/global que colisiona con la vieja (tour, realtime,
// orquestación F0, telemetría) — ver header de neo-home-screen. El swap
// F4 monta el mismo componente SIN `preview` (default false) y todo corre.
export default function Page() {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NeoHomeScreen } = require('@/screens/home/neo/neo-home-screen') as typeof import('@/screens/home/neo/neo-home-screen')
    return (
      <RequireAuth>
        {({ familyId, userId }) => (
          <NeoHomeScreen familyId={familyId} userId={userId} preview />
        )}
      </RequireAuth>
    )
  }
  return <Redirect href="/(app)/settings" />
}
