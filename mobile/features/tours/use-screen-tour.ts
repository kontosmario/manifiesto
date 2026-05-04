import { useCallback, useEffect, useRef } from 'react'
import { useIsFocused } from '@react-navigation/native'
import { triggerHaptic } from '@/lib/haptics'
import { getToursEnabled, getTourSeen, setTourSeen } from './persistence'
import { useTour } from './tour-context'
import type { TourKey } from './tour-keys'

interface UseScreenTourOptions {
  /**
   * Wait this many ms after focus before starting the tour. Lets the
   * screen's RiseView entrance and skeleton-to-data swap settle so
   * the first highlight measures against the real layout, not a
   * placeholder.
   */
  startDelayMs?: number
  /**
   * Force a fresh start regardless of the seen flag. Used by the
   * "Reactivar visitas guiadas" flow in Settings.
   */
  forceStart?: boolean
}

/**
 * Auto-starts the screen's guided tour the first time the user
 * lands on it; marks it seen on dismiss/finish. Wraps the new
 * custom `TourContext` with the same persistence + focus-gating
 * we had with `react-native-copilot`, so callers don't need to
 * change anything.
 *
 * Implementation details:
 *   - The auto-start effect's deps are stable primitives only, so
 *     re-renders of the host screen don't cancel a pending start.
 *   - The `start` fn from the context is captured in a ref each
 *     render so it can change without invalidating the effect.
 *   - We mark the tour seen on `stop` only when the active tour
 *     was actually ours (the context emits onStop with the tour
 *     key, so no name-prefix filtering is needed — it's already
 *     scoped).
 */
export function useScreenTour(
  tour: TourKey,
  { startDelayMs = 600, forceStart = false }: UseScreenTourOptions = {},
): { start: () => void } {
  const ctx = useTour()
  const isFocused = useIsFocused()
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const startedRef = useRef(false)

  // Mark our tour as seen on stop. The context's `activeTour` flips
  // to null when a tour stops; we infer "ours just stopped" by
  // checking if `activeTour` became null while previously it was us.
  const wasActiveRef = useRef(false)
  useEffect(() => {
    const isOurs = ctx.activeTour === tour
    if (isOurs) {
      wasActiveRef.current = true
    } else if (wasActiveRef.current && ctx.activeTour === null) {
      // Just stopped from being our tour.
      wasActiveRef.current = false
      void setTourSeen(tour)
    }
  }, [ctx.activeTour, tour])

  // Auto-start on focus.
  useEffect(() => {
    if (!isFocused) {
      startedRef.current = false
      return
    }
    if (startedRef.current) return
    startedRef.current = true

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    void (async () => {
      const enabled = await getToursEnabled()
      if (cancelled || !enabled) return
      if (!forceStart) {
        const seen = await getTourSeen(tour)
        if (cancelled || seen) return
      }
      timeoutId = setTimeout(() => {
        void triggerHaptic('light')
        ctxRef.current.start(tour)
      }, startDelayMs)
    })()

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [forceStart, isFocused, startDelayMs, tour])

  const start = useCallback(() => {
    void triggerHaptic('light')
    ctxRef.current.start(tour)
  }, [tour])

  return { start }
}
