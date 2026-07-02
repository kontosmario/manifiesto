import { useEffect } from 'react'
import { dispatchAuthFlow } from '@/features/auth-flow/auth-flow-controller'
import { useAuthFlowState } from '@/features/auth-flow/use-auth-flow'

/**
 * Señala a la máquina que el destino está listo para ser revelado
 * (el soar-away del bridge requiere min-hold ∧ destination-ready).
 *
 * `ready=true` por default — destinos que están listos al montar
 * (onboarding, join, biometric-setup). El home pasa
 * `Boolean(snapshot.data)` para esperar su primer dato.
 *
 * Es un evento idempotente: la máquina lo ignora fuera de `bridging`.
 * Por eso RE-señala cada vez que la máquina (re)entra a `bridging`:
 * si `ready` se volvió true mientras el estado era `bridge-error`
 * (la data llegó sola durante el error), la señal original se perdió
 * como no-op y el RETRY posterior quedaba colgado hasta el safety
 * timeout — loop error→retry→error con la data ya sana.
 */
export function useSignalDestinationReady(ready: boolean = true) {
  const bridging = useAuthFlowState().phase === 'bridging'
  useEffect(() => {
    if (ready && bridging) dispatchAuthFlow({ type: 'DESTINATION_READY' })
  }, [ready, bridging])
}
