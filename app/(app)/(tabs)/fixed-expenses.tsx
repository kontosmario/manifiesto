import { RequireAuth } from '@/components/guards'
import { FixedExpensesScreen } from '@/screens/home/fixed-expenses-screen'

export default function FixedExpensesRoute() {
  return <RequireAuth>{({ familyId }) => <FixedExpensesScreen familyId={familyId} />}</RequireAuth>
}
