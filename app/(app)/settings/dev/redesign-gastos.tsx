import { Redirect } from 'expo-router'

// require() dentro del branch __DEV__: Metro inlinea __DEV__=false y
// constant-foldea el branch ANTES de recolectar dependencias, así el
// tooling del rediseño no entra al bundle de release.
export default function Page() {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RedesignGastosPreviewScreen } = require('@/screens/dev/redesign/redesign-gastos-preview-screen') as typeof import('@/screens/dev/redesign/redesign-gastos-preview-screen')
    return <RedesignGastosPreviewScreen />
  }
  return <Redirect href="/(app)/settings" />
}
