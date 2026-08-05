import { Redirect } from 'expo-router'

// Preview dev del KIT de Control (fixtures del handoff, sin datos ni
// auth) — el gate visual del rediseño. El require() dentro de __DEV__ es
// load-bearing: Metro constant-foldea el branch y el screen no entra al
// bundle de release, igual que el resto de las rutas dev.
export default function Page() {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RedesignControlScreen } = require('@/screens/dev/redesign/redesign-control-screen') as typeof import('@/screens/dev/redesign/redesign-control-screen')
    return <RedesignControlScreen />
  }
  return <Redirect href="/(app)/settings" />
}
