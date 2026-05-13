import { Redirect } from 'expo-router'
import { FijosHeroPreviewScreen } from '@/screens/dev/fijos-hero-preview-screen'

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <FijosHeroPreviewScreen />
}
