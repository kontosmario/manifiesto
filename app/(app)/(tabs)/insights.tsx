import { RequireAuth } from '@/components/guards'
import { ControlV2Screen } from '@/screens/home/control-v2-screen'

// Control tab route — renders ControlV2Screen.
export default function InsightsRoute() {
  return (
    <RequireAuth>
      {({ familyId, userId }) => (
        <ControlV2Screen familyId={familyId} userId={userId} />
      )}
    </RequireAuth>
  )
}
