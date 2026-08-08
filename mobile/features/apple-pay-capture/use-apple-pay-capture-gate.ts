import { useCallback, useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { useAuthFlowState } from '@/features/auth-flow/use-auth-flow'
import { getPendingCaptures, isApplePayCaptureSupported } from './native'
import type { PendingCapture } from './types'

/**
 * Entrega las capturas de Apple Pay RECIÉN cuando el viaje de auth está
 * en `ready` (sesión + unlock + reveal terminado) y hay familia. Mismo
 * criterio que `use-share-import-gate`: nunca procesar contenido antes
 * de autenticar.
 *
 * Drena al montar y en cada vuelta a foreground, porque el intent corre
 * mientras la app está en background y no hay evento que lo anuncie.
 *
 * El flag de "prendido" NO es un argumento: quien monta este hook
 * (`ApplePayCaptureHost`) sólo existe cuando el usuario prendió la
 * captura, así que apagarla desmonta el gate entero.
 */
export function useApplePayCaptureGate(args: {
  familyId: string | undefined
  userId: string | undefined
  busy: boolean
  onCaptures: (captures: PendingCapture[]) => void
}) {
  const { familyId, userId, busy, onCaptures } = args
  const authState = useAuthFlowState()
  // `busy` por ref y no por dependencia a propósito: cuando el usuario
  // cierra el sheet sin confirmar, las capturas siguen pendientes. Si
  // `busy` disparara el efecto, el sheet se volvería a abrir solo en el
  // mismo frame en que lo cerró. Se re-ofrecen en la próxima vuelta a
  // foreground, que es cuando el usuario vuelve a mirar la app.
  const busyRef = useRef(busy)
  busyRef.current = busy

  const ready =
    isApplePayCaptureSupported() &&
    authState.phase === 'ready' &&
    Boolean(familyId) &&
    Boolean(userId)

  const drain = useCallback(() => {
    if (!ready || busyRef.current) return
    const captures = getPendingCaptures()
    if (captures.length > 0) onCaptures(captures)
  }, [ready, onCaptures])

  useEffect(() => {
    drain()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') drain()
    })
    return () => subscription.remove()
  }, [drain])
}
