import { Redirect } from 'expo-router'
import { FijosHeroManifiestoScreen } from '@/screens/dev/fijos-hero-manifiesto-screen'

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <FijosHeroManifiestoScreen />
}
