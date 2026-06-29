import { Redirect } from 'expo-router'
import { IntroPreviewScreen } from '@/screens/dev/intro-preview-screen'

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <IntroPreviewScreen />
}
