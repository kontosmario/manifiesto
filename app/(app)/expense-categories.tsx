import { RequireAuth } from '@/components/guards'
import { ExpenseCategoriesScreen } from '@/screens/home/expense-categories-screen'

export default function ExpenseCategoriesRoute() {
  return (
    <RequireAuth>
      {({ familyId }) => <ExpenseCategoriesScreen familyId={familyId} />}
    </RequireAuth>
  )
}
