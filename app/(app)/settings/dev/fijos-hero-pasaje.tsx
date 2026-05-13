import { Redirect } from 'expo-router'
import { FijosHeroPasajeScreen } from '@/screens/dev/fijos-hero-pasaje-screen'

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <FijosHeroPasajeScreen />
}
