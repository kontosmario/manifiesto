import { RequireAuth } from '@/components/guards'
import { NeoNotificationsScreen } from '@/screens/home/neo/neo-notifications-screen'

export default function NotificationsRoute() {
  return (
    <RequireAuth>
      {({ userId, familyId }) => (
        <NeoNotificationsScreen userId={userId} familyId={familyId} />
      )}
    </RequireAuth>
  )
}
