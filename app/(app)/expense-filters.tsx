import { RequireAuth } from '@/components/guards'
import { ExpenseFiltersScreen } from '@/screens/home/expense-filters-screen'

export default function ExpenseFiltersRoute() {
  return (
    <RequireAuth>
      {({ familyId }) => <ExpenseFiltersScreen familyId={familyId} />}
    </RequireAuth>
  )
}
