import { useCallback, useState } from 'react'
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
 */
export function CycleWrappedBridge() {
  const [active, setActive] = useState<CycleWrappedPayload | null>(null)

  // Stable callback — el listener lee como dep, función fresh por
  // render re-subscribiría en cada parent update.
  const handleWrapped = useCallback((payload: CycleWrappedPayload) => {
    // Si ya hay uno en pantalla, override. Wrapped back-to-back no
    // debería pasar en producción (el trigger es cobro mensual), pero
    // el dev preview puede dispararlo dos veces seguidas — la última
    // gana, las anteriores se descartan.
    setActive(payload)
  }, [])

  const handleDismiss = useCallback(() => setActive(null), [])

  useCycleWrappedListener(handleWrapped)

  return <CycleWrappedModal payload={active} onDismiss={handleDismiss} />
}
