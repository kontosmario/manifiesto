import { RequireAuth } from '@/components/guards'
import { AddExpenseScreen } from '@/screens/home/add-expense-screen'

export default function AddExpenseRoute() {
  return (
    <RequireAuth>
      {({ familyId, userId }) => <AddExpenseScreen familyId={familyId} userId={userId} />}
    </RequireAuth>
  )
}
