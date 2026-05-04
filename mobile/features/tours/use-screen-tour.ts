import { useCallback, useEffect, useRef } from 'react'
import { useIsFocused } from '@react-navigation/native'
import { triggerHaptic } from '@/lib/haptics'
import { getToursEnabled, getTourSeen, setTourSeen } from './persistence'
import { useTour } from './tour-context'
import { getTourScrollEntry } from './tour-scroll-registry'
import type { TourKey } from './tour-keys'

/**
 * Reset the screen's ScrollView to y=0 before starting the tour
 * and wait for the scroll to settle. Without this, if the user has
 * already scrolled the screen mid-load (or reactivated the tour
 * from Settings while the screen carries a stale offset), every
 * step's measure runs against a moved viewport and the cutout
 * lands in the wrong place. Resetting to top guarantees the first
 * step measures against a fresh layout.
 *
 * Returns a promise that resolves once the scroll is presumed
 * complete (~320ms — RN's animated scroll has no completion
 * callback, so we time-box it).
 */
async function resetScrollToTop(tour: TourKey): Promise<void> {
  const entry = getTourScrollEntry(tour)
  if (!entry?.scrollView) return
  if (entry.scrollYRef.current <= 1) return // already at top
  const sv = entry.scrollView as unknown as {
    scrollTo: (opts: { y: number; animated: boolean }) => void
  }
  sv.scrollTo({ y: 0, animated: true })
  await new Promise<void>((resolve) => setTimeout(resolve, 320))
}

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
): { start: () => Promise<void> } {
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
      timeoutId = setTimeout(async () => {
        if (cancelled) return
        void triggerHaptic('light')
        // Reset scroll to top so the first step's measurement runs
        // against an unscrolled layout. Avoids mid-tour drift when
        // the user reopens the tour from Settings while the screen
        // is mid-page.
        await resetScrollToTop(tour)
        if (cancelled) return
        ctxRef.current.start(tour)
      }, startDelayMs)
    })()

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [forceStart, isFocused, startDelayMs, tour])

  const start = useCallback(async () => {
    void triggerHaptic('light')
    await resetScrollToTop(tour)
    ctxRef.current.start(tour)
  }, [tour])

  return { start }
}
