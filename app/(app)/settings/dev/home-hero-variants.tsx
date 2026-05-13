import { Redirect } from 'expo-router'
import { HomeHeroVariantsScreen } from '@/screens/dev/home-hero-variants-screen'

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <HomeHeroVariantsScreen />
}
