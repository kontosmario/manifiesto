import { RequireAuth } from '@/components/guards'
import { ModalContentEntrance } from '@/components/ui/modal-content-entrance'
import { AddExpenseScreen } from '@/screens/home/add-expense-screen'

export default function AddExpenseRoute() {
  return (
    <ModalContentEntrance style={{ flex: 1 }}>
      <RequireAuth>
        {({ familyId, userId }) => <AddExpenseScreen familyId={familyId} userId={userId} />}
      </RequireAuth>
    </ModalContentEntrance>
  )
}
