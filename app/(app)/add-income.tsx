import { RequireAuth } from '@/components/guards'
import { ModalContentEntrance } from '@/components/ui/modal-content-entrance'
import { AddIncomeScreen } from '@/screens/home/add-income-screen'

export default function AddIncomeRoute() {
  return (
    <ModalContentEntrance style={{ flex: 1 }}>
      <RequireAuth>
        {({ familyId, userId }) => (
          <AddIncomeScreen familyId={familyId} userId={userId} />
        )}
      </RequireAuth>
    </ModalContentEntrance>
  )
}
