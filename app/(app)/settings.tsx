import { RequireAuth } from '@/components/guards'
import { SettingsScreen } from '@/screens/settings/settings-screen'

export default function SettingsRoute() {
  return (
    <RequireAuth>
      {({ familyId, userId }) => (
        <SettingsScreen familyId={familyId} userId={userId} />
      )}
    </RequireAuth>
  )
}
