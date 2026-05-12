import { Redirect } from 'expo-router'
import { CycleWrappedPreviewScreen } from '@/screens/dev/cycle-wrapped-preview-screen'

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <CycleWrappedPreviewScreen />
}
