import { RequireAuth } from '@/components/guards'
import { ModalContentEntrance } from '@/components/ui/modal-content-entrance'
import { ExpenseFiltersScreen } from '@/screens/home/expense-filters-screen'

export default function ExpenseFiltersRoute() {
  return (
    <ModalContentEntrance style={{ flex: 1 }}>
      <RequireAuth>
        {({ familyId }) => <ExpenseFiltersScreen familyId={familyId} />}
      </RequireAuth>
    </ModalContentEntrance>
  )
}
