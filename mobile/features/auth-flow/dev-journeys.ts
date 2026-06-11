// Viajes simulados para Settings → Desarrollo. Inyectan adapters fake
// (prompt biométrico y red simulados con delays reales del spec) y al
// terminar restauran los adapters reales. SOLO __DEV__.
//
// Permiten validar el bridge real (fade-in → hold → soar-away / error
// con Reintentar) sin repetir logout/login/kill-app por cada ajuste.

import {
  configureAuthFlow,
  dispatchAuthFlow,
  resetAuthFlowForTesting,
  type AuthFlowAdapters,
} from '@/features/auth-flow/auth-flow-controller'
import { realAuthFlowAdapters } from '@/features/auth-flow/auth-flow-adapters'
import { triggerHaptic } from '@/lib/haptics'
import { authFlowLog } from '@/lib/auth-flow-logger'

export type DevJourney = 'faceid-success' | 'faceid-cancel' | 'network-error'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function runDevJourney(journey: DevJourney) {
  if (!__DEV__) return
  const fake: AuthFlowAdapters = {
    ...realAuthFlowAdapters,
    runProbes: async () => ({
      hasSession: true,
      shouldUseBiometric: true,
      pinSet: false,
      hasSavedCredentials: true,
      isUnlocked: false,
    }),
    promptBiometric: async () => {
      await wait(2200) // tiempo típico de FaceID
      return journey === 'faceid-cancel' ? { success: false } : { success: true }
    },
    prefetchSnapshot: async () => {
      await wait(900)
      if (journey === 'network-error') throw new Error('simulated offline')
    },
    confirmSession: async () => 'ok',
    resolveDestinationRoute: async () => '/(app)/(tabs)/home',
    // En el simulado NO navegamos de verdad: el user está en Settings.
    navigate: (to) => authFlowLog('dev-journey', `navigate simulado → ${to}`),
    haptic: (f) => {
      void triggerHaptic(f)
    },
    markAppUnlocked: () => {},
    resetAppLock: () => {},
  }
  resetAuthFlowForTesting()
  configureAuthFlow(fake)
  dispatchAuthFlow({ type: 'BOOT' })
  // DESTINATION_READY simulado: en el flujo real lo emite el home.
  if (journey !== 'network-error') {
    void wait(2200 + 600).then(() => dispatchAuthFlow({ type: 'DESTINATION_READY' }))
  }
  // Restaurar adapters reales cuando el viaje terminó (ready a los ~4s;
  // 25s cubre el caso error + Reintentar manual).
  void wait(25_000).then(() => {
    resetAuthFlowForTesting()
    configureAuthFlow(realAuthFlowAdapters)
  })
}
