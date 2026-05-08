import DevHealthScreen from '@/screens/dev-health-screen'
import { Redirect } from 'expo-router'

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <DevHealthScreen />
}
