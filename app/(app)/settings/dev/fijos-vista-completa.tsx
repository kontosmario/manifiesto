import { Redirect } from 'expo-router'
import { FijosVistaCompletaScreen } from '@/screens/dev/fijos-vista-completa-screen'

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <FijosVistaCompletaScreen />
}
