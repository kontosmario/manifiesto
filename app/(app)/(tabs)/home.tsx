import { RequireAuth } from '@/components/guards'
import { NeoHomeScreen } from '@/screens/home/neo/neo-home-screen'

// F4 swap (2026-07-21): la Home LIVE es la rediseñada (neo). preview default
// false = comportamiento completo (realtime, tour, telemetría, orquestación).
// La vieja `@/screens/home/home-screen` queda sin ruta como referencia.
// Revertible: restaurar el import + <HomeScreen/> anterior.
export default function HomeRoute() {
  return (
    <RequireAuth>
      {({ familyId, userId }) => <NeoHomeScreen familyId={familyId} userId={userId} />}
    </RequireAuth>
  )
}
