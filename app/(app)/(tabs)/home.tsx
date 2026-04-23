import { RequireAuth } from '@/components/guards'
import { HomeScreen } from '@/screens/home/home-screen'

export default function HomeRoute() {
  return (
    <RequireAuth>
      {({ familyId, userId }) => <HomeScreen familyId={familyId} userId={userId} />}
    </RequireAuth>
  )
}
