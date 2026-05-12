import { RequireAuth } from '@/components/guards'
import { AchievementsGalleryScreen } from '@/screens/settings/achievements-gallery-screen'

export default function AchievementsRoute() {
  return (
    <RequireAuth>
      {() => <AchievementsGalleryScreen />}
    </RequireAuth>
  )
}
