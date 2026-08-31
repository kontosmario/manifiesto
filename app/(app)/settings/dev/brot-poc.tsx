import { Redirect } from 'expo-router'

// Mismo patrón que `redesign-brot.tsx`: el require() vive dentro del
// branch __DEV__ para que Metro constant-foldee el branch ANTES de
// recolectar dependencias. Así el PoC — y su .mp4 de 281 KB — no entran
// al bundle de release.
export default function Page() {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BrotPocScreen } = require('@/screens/dev/brot-poc/brot-poc-screen') as typeof import('@/screens/dev/brot-poc/brot-poc-screen')
    return <BrotPocScreen />
  }
  return <Redirect href="/(app)/settings" />
}
