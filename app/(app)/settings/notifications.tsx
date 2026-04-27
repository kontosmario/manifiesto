import { RequireAuth } from '@/components/guards'
import { NotificationsPreferencesScreen } from '@/screens/settings/notifications-preferences-screen'

export default function NotificationsPreferencesRoute() {
  return (
    <RequireAuth>
      {() => <NotificationsPreferencesScreen />}
    </RequireAuth>
  )
}
