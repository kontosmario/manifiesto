import { useSyncExternalStore } from 'react'
import {
  getAuthFlowState,
  subscribeAuthFlow,
} from '@/features/auth-flow/auth-flow-controller'
import { getOverlayMode } from '@/features/auth-flow/auth-flow-machine'
import { useOfflineTakeover } from '@/features/auth-flow/offline-takeover'

export function useAuthFlowState() {
  return useSyncExternalStore(subscribeAuthFlow, getAuthFlowState, getAuthFlowState)
}

/**
 * True mientras el overlay de transición está en pantalla (bridge /
 * reveal / error de la máquina, o takeover offline global). Reemplaza
 * los reads de `useAuthTransitionSplash().phase !== 'hidden'` que
 * gateaban UI (tours, dashboard) sobre el store viejo.
 */
export function useIsAuthOverlayVisible(): boolean {
  const state = useAuthFlowState()
  const offline = useOfflineTakeover()
  return offline || getOverlayMode(state) !== 'hidden'
}
