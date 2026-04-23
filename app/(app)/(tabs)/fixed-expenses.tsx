import { RequireAuth } from '@/components/guards'
import { FijosV2Screen } from '@/screens/home/fijos-v2-screen'

export default function FixedExpensesRoute() {
  return <RequireAuth>{({ familyId }) => <FijosV2Screen familyId={familyId} />}</RequireAuth>
}
