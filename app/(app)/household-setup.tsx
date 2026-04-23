import { RequireAuth } from '@/components/guards'
import { HouseholdSetupScreen } from '@/screens/settings/household-setup-screen'

export default function HouseholdSetupRoute() {
  return (
    <RequireAuth>
      {({ familyId }) => <HouseholdSetupScreen familyId={familyId} />}
    </RequireAuth>
  )
}

