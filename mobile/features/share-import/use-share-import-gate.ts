import { useEffect, useSyncExternalStore } from 'react'
import { useAuthFlowState } from '@/features/auth-flow/use-auth-flow'
import {
  consumePendingShare,
  peekPendingShare,
  subscribePendingShare,
} from '@/features/share-import/pending-share-store'

/**
 * Entrega la captura compartida al callback RECIÉN cuando:
 *  · auth flow en fase `ready` (sesión + unlock + reveal terminado —
 *    decisión spec: nunca procesar contenido antes de autenticar),
 *  · familyId/userId presentes (datos del wizard),
 *  · el wizard NO está ya abierto (`busy` — la captura espera y se
 *    re-chequea cuando el host la libera).
 */
export function useShareImportGate(args: {
  familyId: string | undefined
  userId: string | undefined
  busy: boolean
  onShare: (uri: string) => void
}) {
  const { familyId, userId, busy, onShare } = args
  const authState = useAuthFlowState()
  const pending = useSyncExternalStore(
    subscribePendingShare,
    peekPendingShare,
    peekPendingShare,
  )

  useEffect(() => {
    if (pending === null) return
    if (busy) return
    if (authState.phase !== 'ready') return
    if (!familyId || !userId) return
    const uri = consumePendingShare()
    if (uri !== null) onShare(uri)
  }, [pending, busy, authState.phase, familyId, userId, onShare])
}
