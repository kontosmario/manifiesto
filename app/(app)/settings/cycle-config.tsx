import { RequireAuth } from '@/components/guards'
import { CycleConfigScreen } from '@/screens/settings/cycle-config-screen'

export default function CycleConfigRoute() {
  return (
    <RequireAuth>
      {({ familyId }) => <CycleConfigScreen familyId={familyId} />}
    </RequireAuth>
  )
}
