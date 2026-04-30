import { RequireAuth } from '@/components/guards'
import { ModalContentEntrance } from '@/components/ui/modal-content-entrance'
import { ExpenseCategoriesScreen } from '@/screens/home/expense-categories-screen'

export default function ExpenseCategoriesRoute() {
  return (
    <ModalContentEntrance style={{ flex: 1 }}>
      <RequireAuth>
        {({ familyId }) => <ExpenseCategoriesScreen familyId={familyId} />}
      </RequireAuth>
    </ModalContentEntrance>
  )
}
