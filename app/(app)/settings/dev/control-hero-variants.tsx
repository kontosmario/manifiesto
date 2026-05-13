import { Redirect } from 'expo-router'
import { ControlHeroVariantsScreen } from '@/screens/dev/control-hero-variants-screen'

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <ControlHeroVariantsScreen />
}
