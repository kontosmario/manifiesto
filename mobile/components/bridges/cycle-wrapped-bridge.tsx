import { useCallback, useRef, useState } from 'react'
import { CycleWrappedModal } from '@/components/wrapped/cycle-wrapped-modal'
import {
  useCycleWrappedListener,
  type CycleWrappedPayload,
} from '@/lib/cycle-wrapped-emitter'

/**
 * App-level bridge that listens to `cycle-wrapped-emitter` and pops
 * the `CycleWrappedModal` con el recap del ciclo recién cerrado.
 *
 * Mounted ONCE en `AppStackShell`, FUERA del `<Stack>` — así el modal
 * sobrevive a screen pushes (si el user confirma cobro y navega
 * inmediatamente, el wrapped igual aparece sobre la pantalla nueva).
 *
 * Mismo pattern que `AchievementUnlockBridge`. La fuente del payload
 * puede ser (a) el flow real post-cobro o (b) el dev preview en
 * Settings — el Bridge no distingue, ambos pasan por el emitter.
 *
 * Re-trigger guard (2026-06-08): owner reportó que el wrapped se
 * "reiniciaba" al cerrar con "Empezar el próximo" en el caso de mes
 * neutro. Causa indeterminada — algún re-render del home dashboard
 * dispara `triggerCycleWrapped` dos veces dentro de ms. El primer
 * payload se renderea, el user dismisses, y el segundo arrives →
 * setActive(newPayload) → modal se re-abre con scenes reset.
 *
 * Fix pragmático: rechazar nuevos payloads dentro de los REOPEN_GUARD_MS
 * desde el último dismiss. Suficiente para cubrir el doble-fire sin
 * romper el flow legítimo (el re-trigger intencional desde Control v2
 * "Reproducir cierre" requiere ≥2 segundos de interacción del user).
 */
const REOPEN_GUARD_MS = 1500

export function CycleWrappedBridge() {
  const [active, setActive] = useState<CycleWrappedPayload | null>(null)
  const lastDismissAtRef = useRef<number>(0)

  // Stable callback — el listener lee como dep, función fresh por
  // render re-subscribiría en cada parent update.
  const handleWrapped = useCallback((payload: CycleWrappedPayload) => {
    // Guard contra re-fire post-dismiss: si el modal cerró hace menos
    // de REOPEN_GUARD_MS, ignoramos el nuevo trigger.
    const elapsedSinceDismiss = performance.now() - lastDismissAtRef.current
    if (lastDismissAtRef.current > 0 && elapsedSinceDismiss < REOPEN_GUARD_MS) {
      return
    }
    // Si ya hay uno en pantalla, override. Wrapped back-to-back no
    // debería pasar en producción (el trigger es cobro mensual), pero
    // el dev preview puede dispararlo dos veces seguidas — la última
    // gana, las anteriores se descartan.
    setActive(payload)
  }, [])

  const handleDismiss = useCallback(() => {
    lastDismissAtRef.current = performance.now()
    setActive(null)
  }, [])

  useCycleWrappedListener(handleWrapped)

  return <CycleWrappedModal payload={active} onDismiss={handleDismiss} />
}
