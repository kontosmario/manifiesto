import { useEffect } from 'react'
import { dispatchAuthFlow } from '@/features/auth-flow/auth-flow-controller'

/**
 * Señala a la máquina que el destino está listo para ser revelado
 * (el soar-away del bridge requiere min-hold ∧ destination-ready).
 *
 * `ready=true` por default — destinos que están listos al montar
 * (onboarding, join, biometric-setup). El home pasa
 * `Boolean(snapshot.data)` para esperar su primer dato.
 *
 * Es un evento idempotente: la máquina lo ignora fuera de `bridging`.
 */
export function useSignalDestinationReady(ready: boolean = true) {
  useEffect(() => {
    if (ready) dispatchAuthFlow({ type: 'DESTINATION_READY' })
  }, [ready])
}
