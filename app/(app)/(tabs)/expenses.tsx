import { RequireAuth } from '@/components/guards'
import { ExpensesScreen } from '@/screens/home/expenses-screen'

export default function ExpensesRoute() {
  return (
    <RequireAuth>
      {({ familyId }) => <ExpensesScreen familyId={familyId} />}
    </RequireAuth>
  )
}
