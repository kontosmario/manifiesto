import { useCallback, useEffect, useRef } from 'react'
import { useIsFocused } from '@react-navigation/native'
import { useCopilot } from 'react-native-copilot'
import { triggerHaptic } from '@/lib/haptics'
import { getToursEnabled, getTourSeen, setTourSeen } from './persistence'
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
 * Returns a manual `start` function for the rare case where the
 * caller wants to trigger the tour from a button (e.g. an inline
 * "Ver tutorial" link inside the screen).
 *
 * The hook does not own the `<CopilotStep>` wrapping — each screen
 * is responsible for rendering its own steps with `name` prefixed
 * by the tour key (e.g. `home/0`, `home/1`) and `active={isFocused}`
 * via the shared `<TourStep>` helper.
 */
export function useScreenTour(
  tour: TourKey,
  { startDelayMs = 600, forceStart = false }: UseScreenTourOptions = {},
): { start: () => Promise<void> } {
  const { start: copilotStart, copilotEvents } = useCopilot()
  const isFocused = useIsFocused()
  const startedRef = useRef(false)

  // Mark the tour as seen on stop (whether the user finished it or
  // dismissed it). Once flagged, auto-start won't re-fire.
  useEffect(() => {
    const handleStop = () => {
      void setTourSeen(tour)
    }
    copilotEvents.on('stop', handleStop)
    return () => {
      copilotEvents.off('stop', handleStop)
    }
  }, [copilotEvents, tour])

  // Auto-start on first focus, but only if (a) tours are enabled
  // globally and (b) this specific tour hasn't been seen yet.
  useEffect(() => {
    if (!isFocused) {
      // Reset the start guard when leaving the screen so re-entries
      // can re-evaluate (still gated by the seen flag).
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
        void copilotStart()
      }, startDelayMs)
    })()

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [copilotStart, forceStart, isFocused, startDelayMs, tour])

  const start = useCallback(async () => {
    void triggerHaptic('light')
    await copilotStart()
  }, [copilotStart])

  return { start }
}
