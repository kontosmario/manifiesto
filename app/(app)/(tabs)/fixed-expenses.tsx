import { RequireAuth } from '@/components/guards'
import { FijosV3Screen } from '@/screens/home/fijos-v3-screen'
// ROLLBACK · si V3 falla, comentar el import de arriba y restaurar:
// import { FijosV2Screen } from '@/screens/home/fijos-v2-screen'

export default function FixedExpensesRoute() {
  return <RequireAuth>{({ familyId }) => <FijosV3Screen familyId={familyId} />}</RequireAuth>
}
