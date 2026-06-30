import { useEffect, useRef } from 'react'
import { InteractionManager } from 'react-native'

import { PermissionPrimeSheet } from '@/components/permissions/permission-prime-sheet'
import { usePushPermissionPrime } from '@/features/push/use-push-permission-prime'

interface Props {
  userId: string
  familyId?: string | null
  /** Sólo evaluamos cuando el Home ya está listo (snapshot cargado), para
   *  no competir con la animación de entrada ni con un tour. */
  ready: boolean
}

/**
 * Re-prompt de permiso de push en el Home. Cubre el hueco del priming de
 * onboarding: un usuario que loguea una cuenta YA existente en un device
 * nuevo (o que tocó "Más tarde" hace >7d) nunca pasa por
 * onboarding-success, así que jamás se le pedía el permiso ni se le
 * registraba el token. Acá reusamos el mismo PermissionPrimeSheet.
 *
 * La elegibilidad (build soporta push + sin permiso + cooldown vencido)
 * descarta a las cuentas nuevas (ya concedieron o quedaron en cooldown
 * en onboarding), así que NO se duplica con ese flujo.
 *
 * Se dispara una sola vez por mount, diferido con InteractionManager para
 * dejar pasar la animación de entrada y cualquier tour gateado por focus
 * (evita el modal-chain race de iOS).
 */
export function PushPermissionPrompt({ userId, familyId, ready }: Props) {
  const prime = usePushPermissionPrime({ userId, familyId })
  const { showIfEligible } = prime
  const checkedRef = useRef(false)

  useEffect(() => {
    if (!ready || !userId || checkedRef.current) return
    checkedRef.current = true
    let active = true
    const task = InteractionManager.runAfterInteractions(() => {
      if (active) void showIfEligible()
    })
    return () => {
      active = false
      task.cancel()
    }
  }, [ready, userId, showIfEligible])

  return (
    <PermissionPrimeSheet
      visible={prime.visible}
      type="notifications"
      onAllow={() => {
        void prime.onAllow()
      }}
      onDismiss={() => {
        void prime.onDismiss()
      }}
    />
  )
}
