import { Redirect } from 'expo-router'
import { FijosRowVariantsScreen } from '@/screens/dev/fijos-row-variants-screen'

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <FijosRowVariantsScreen />
}
