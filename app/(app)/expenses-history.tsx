import { RequireAuth } from '@/components/guards'
import { ExpensesHistoryScreen } from '@/screens/home/expenses-history-screen'

export default function ExpensesHistoryRoute() {
  return (
    <RequireAuth>
      {({ familyId }) => <ExpensesHistoryScreen canGoBack familyId={familyId} title="Historial" />}
    </RequireAuth>
  )
}
