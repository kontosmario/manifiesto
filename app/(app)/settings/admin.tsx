import { RequireAuth } from '@/components/guards'
import { AdminScreen } from '@/screens/settings/admin-screen'

export default function AdminRoute() {
  return <RequireAuth>{() => <AdminScreen />}</RequireAuth>
}
