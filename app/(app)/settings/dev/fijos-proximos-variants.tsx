import { Redirect } from 'expo-router'
import { FijosProximosVariantsScreen } from '@/screens/dev/fijos-proximos-variants-screen'

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <FijosProximosVariantsScreen />
}
