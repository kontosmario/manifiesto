import { Redirect } from 'expo-router'
import { ActivityOcrPreviewScreen } from '@/screens/dev/activity-ocr-preview-screen'

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <ActivityOcrPreviewScreen />
}
