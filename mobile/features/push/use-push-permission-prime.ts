import { useCallback, useEffect, useRef, useState } from 'react'

import {
  applyPushPermissionAllow,
  applyPushPermissionDismiss,
  isPushPrimeEligible,
} from '@/features/push/push-permission-actions'

interface Args {
  userId: string
  /** Necesario para registrar el token apenas se concede el permiso.
   *  Si falta, el registro lo hace el shell en el próximo mount. */
  familyId?: string | null
}

export interface PushPermissionPrime {
  /** Si el priming sheet debe estar visible. */
  visible: boolean
  /**
   * Muestra el sheet sólo si el usuario es elegible (build soporta push,
   * sin permiso aún, cooldown vencido). Devuelve `true` si lo mostró → las
   * cuentas que ya concedieron o están en cooldown devuelven `false`, así
   * el re-prompt del Home NO se duplica con el priming de onboarding.
   */
  showIfEligible: () => Promise<boolean>
  /** "Permitir": cooldown + prompt nativo + registro on-grant + Ajustes. */
  onAllow: () => Promise<void>
  /** "Más tarde": cooldown de 7 días. */
  onDismiss: () => Promise<void>
}

/**
 * Lógica compartida del priming de permiso de push. La usan tanto el
 * onboarding-success (primer alta) como el re-prompt del Home (login a una
 * cuenta existente / "Más tarde" vencido). Centralizar evita que los dos
 * call-sites diverjan. Las decisiones puras (fail-safe, nunca throwean) viven
 * en `push-permission-actions`.
 */
export function usePushPermissionPrime({ userId, familyId }: Args): PushPermissionPrime {
  const [visible, setVisible] = useState(false)
  // Las operaciones son async y el Home puede desmontarse mientras corren
  // (navegación rápida). `setVisibleSafe` evita cualquier setState tras unmount
  // — guardado UNIFORME en todos los call-sites para no dejar asimetrías.
  const mountedRef = useRef(true)
  useEffect(
    () => () => {
      mountedRef.current = false
    },
    [],
  )
  const setVisibleSafe = useCallback((next: boolean) => {
    if (mountedRef.current) setVisible(next)
  }, [])

  // Deps a propósito sólo `setVisibleSafe` (estable): mantener la referencia
  // estable importa porque el effect del Home la usa como dependencia.
  const showIfEligible = useCallback(async () => {
    if (!(await isPushPrimeEligible())) return false
    setVisibleSafe(true)
    return true
  }, [setVisibleSafe])

  const onAllow = useCallback(async () => {
    setVisibleSafe(false)
    await applyPushPermissionAllow({ userId, familyId })
  }, [userId, familyId, setVisibleSafe])

  const onDismiss = useCallback(async () => {
    setVisibleSafe(false)
    await applyPushPermissionDismiss()
  }, [setVisibleSafe])

  return { visible, showIfEligible, onAllow, onDismiss }
}
