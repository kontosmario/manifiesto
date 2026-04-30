import { RequireAuth } from '@/components/guards'
import { ModalContentEntrance } from '@/components/ui/modal-content-entrance'
import { HouseholdSetupScreen } from '@/screens/settings/household-setup-screen'

export default function HouseholdSetupRoute() {
  return (
    <ModalContentEntrance style={{ flex: 1 }}>
      <RequireAuth>
        {({ familyId }) => <HouseholdSetupScreen familyId={familyId} />}
      </RequireAuth>
    </ModalContentEntrance>
  )
}
