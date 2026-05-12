import { Redirect } from 'expo-router'
import { AchievementsStreakPreviewScreen } from '@/screens/dev/achievements-streak-preview-screen'

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <AchievementsStreakPreviewScreen />
}
