import { useCallback, useEffect, useRef } from 'react'
import { useIsFocused } from '@react-navigation/native'
import { useCopilot } from 'react-native-copilot'
import { triggerHaptic } from '@/lib/haptics'
import { getToursEnabled, getTourSeen, setTourSeen } from './persistence'
import { getTourScrollView } from './tour-scroll-registry'
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
 * lands on it. Marks the tour as "seen" once the user finishes or
 * dismisses the tour.
 *
 * IMPORTANT: this hook lives in 4 screens that are all kept mounted
 * by the tab navigator (`freezeOnBlur: false`). Two consequences
 * shape the implementation:
 *
 *   1. The auto-start effect MUST NOT re-run on every render of the
 *      host screen, because each cleanup cancels the pending
 *      `setTimeout` and the next run sees `startedRef.current` is
 *      already true and skips. Result: the tour silently never
 *      fires. We avoid this by keeping the effect deps to stable
 *      primitives only and reading the (potentially unstable)
 *      `start()` function via a ref.
 *
 *   2. `copilotEvents.on('stop', ...)` fires for ANY tour that
 *      stops, not just ours. Without filtering, all four tours
 *      would mark themselves as seen the moment the first one
 *      finishes. We track the last active step name and only mark
 *      our own tour as seen when the stopped step belonged to it
 *      (step names are prefixed `<tour>/<order>` by `<TourStep>`).
 */
export function useScreenTour(
  tour: TourKey,
  { startDelayMs = 600, forceStart = false }: UseScreenTourOptions = {},
): { start: () => Promise<void> } {
  const { copilotEvents, start: copilotStart } = useCopilot()
  const isFocused = useIsFocused()
  // Snapshot the (possibly unstable) start fn to a ref so the
  // auto-start effect's deps don't include it. See `IMPORTANT`
  // note above for why this matters.
  const startRef = useRef(copilotStart)
  startRef.current = copilotStart
  const startedRef = useRef(false)
  const lastStepNameRef = useRef<string | undefined>(undefined)

  // Mark the tour as seen on stop, but only if the stopped tour
  // was actually ours. Without the `startsWith` filter, any tour's
  // stop event would mark all four tours as seen, since every
  // mounted screen registers its own `handleStop` on the same
  // global emitter.
  useEffect(() => {
    const handleStepChange = (step: { name: string } | undefined) => {
      if (step?.name) lastStepNameRef.current = step.name
    }
    const handleStop = () => {
      const name = lastStepNameRef.current
      if (name?.startsWith(`${tour}/`)) {
        void setTourSeen(tour)
        // Reset so a subsequent stop from a different tour doesn't
        // re-mark this one as seen.
        lastStepNameRef.current = undefined
      }
    }
    copilotEvents.on('stepChange', handleStepChange)
    copilotEvents.on('stop', handleStop)
    return () => {
      copilotEvents.off('stepChange', handleStepChange)
      copilotEvents.off('stop', handleStop)
    }
  }, [copilotEvents, tour])

  // Auto-start on focus, gated by the seen flag and the global
  // enabled flag. Deps are stable per render so this effect runs
  // only when the screen actually focuses or unfocuses.
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
        // Pass the screen's ScrollView so the lib auto-scrolls
        // each step's target into view before animating the
        // highlight. The library caches it internally on the first
        // start() call — subsequent stepChange events use the same
        // ScrollView for the auto-scroll.
        void startRef.current(undefined, getTourScrollView(tour))
      }, startDelayMs)
    })()

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [forceStart, isFocused, startDelayMs, tour])

  const start = useCallback(async () => {
    void triggerHaptic('light')
    await startRef.current(undefined, getTourScrollView(tour))
  }, [tour])

  return { start }
}
