import { Redirect } from 'expo-router'
import { FijosHeaderVariantsScreen } from '@/screens/dev/fijos-header-variants-screen'

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <FijosHeaderVariantsScreen />
}
