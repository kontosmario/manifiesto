import { Redirect } from 'expo-router'
import { FijosSeleccionFinalScreen } from '@/screens/dev/fijos-seleccion-final-screen'

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <FijosSeleccionFinalScreen />
}
