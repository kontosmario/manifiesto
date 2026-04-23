import { RequireAuth } from '@/components/guards'
import { SettingsScreen } from '@/screens/settings/settings-screen'

export default function SettingsRoute() {
  return (
    <RequireAuth>
      {({ familyCode, familyId, userId }) => (
        <SettingsScreen familyCode={familyCode} familyId={familyId} userId={userId} />
      )}
    </RequireAuth>
  )
}
