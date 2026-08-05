import { Redirect } from 'expo-router'
import { RequireAuth } from '@/components/guards'

// Preview dev de CONTROL neo (datos reales, preview=true apaga tour/
// telemetría). El require() dentro del branch __DEV__ es load-bearing:
// Metro constant-foldea el branch antes de recolectar dependencias y el
// screen no entra al bundle de release — mismo patrón que neo-home.tsx.
export default function Page() {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NeoControlScreen } = require('@/screens/home/neo/neo-control-screen') as typeof import('@/screens/home/neo/neo-control-screen')
    return (
      <RequireAuth>
        {({ familyId, userId }) => (
          <NeoControlScreen familyId={familyId} userId={userId} preview />
        )}
      </RequireAuth>
    )
  }
  return <Redirect href="/(app)/settings" />
}
