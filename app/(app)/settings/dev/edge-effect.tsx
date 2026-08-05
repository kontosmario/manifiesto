import { Redirect } from 'expo-router'

// Banco de pruebas del scroll edge effect con insets simulados (permite
// verlo sin device con notch/isla). El require() dentro de __DEV__ es
// load-bearing: Metro constant-foldea el branch y el screen no entra al
// bundle de release.
export default function Page() {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EdgeEffectPreviewScreen } = require('@/screens/dev/edge-effect-preview-screen') as typeof import('@/screens/dev/edge-effect-preview-screen')
    return <EdgeEffectPreviewScreen />
  }
  return <Redirect href="/(app)/settings" />
}
