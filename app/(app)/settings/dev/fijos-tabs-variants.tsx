import { Redirect } from 'expo-router'
import { FijosTabsVariantsScreen } from '@/screens/dev/fijos-tabs-variants-screen'

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <FijosTabsVariantsScreen />
}
