import { RequireAuth } from '@/components/guards'
import { NotificationsScreen } from '@/screens/home/notifications-screen'

export default function NotificationsRoute() {
  return (
    <RequireAuth>
      {({ userId, familyId }) => (
        <NotificationsScreen userId={userId} familyId={familyId} />
      )}
    </RequireAuth>
  )
}
