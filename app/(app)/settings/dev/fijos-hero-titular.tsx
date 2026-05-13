import { Redirect } from 'expo-router'
import { FijosHeroTitularScreen } from '@/screens/dev/fijos-hero-titular-screen'

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <FijosHeroTitularScreen />
}
