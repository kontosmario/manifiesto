import { useSyncExternalStore } from 'react'
import {
  getAuthFlowState,
  subscribeAuthFlow,
} from '@/features/auth-flow/auth-flow-controller'

export function useAuthFlowState() {
  return useSyncExternalStore(subscribeAuthFlow, getAuthFlowState, getAuthFlowState)
}
