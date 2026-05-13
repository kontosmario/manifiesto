import { Redirect } from 'expo-router'
import { FijosTabsV2Screen } from '@/screens/dev/fijos-tabs-v2-screen'

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <FijosTabsV2Screen />
}
