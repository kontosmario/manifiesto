import { RequireAuth } from '@/components/guards'
import { AboutScreen } from '@/screens/settings/about-screen'

export default function AboutRoute() {
  return (
    <RequireAuth>
      {({ userId }) => <AboutScreen userId={userId} />}
    </RequireAuth>
  )
}
