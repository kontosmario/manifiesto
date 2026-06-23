import { RequireAuth } from '@/components/guards'
import { GardenScreen } from '@/screens/garden/garden-screen'

export default function GardenRoute() {
  return (
    <RequireAuth>
      {({ familyId, userId }) => <GardenScreen familyId={familyId} userId={userId} />}
    </RequireAuth>
  )
}
