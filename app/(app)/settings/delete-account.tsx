import { RequireAuth } from '@/components/guards'
import { DeleteAccountScreen } from '@/screens/settings/delete-account-screen'

export default function DeleteAccountRoute() {
  return (
    <RequireAuth>
      {({ userId, familyId }) => (
        <DeleteAccountScreen userId={userId} familyId={familyId} />
      )}
    </RequireAuth>
  )
}
