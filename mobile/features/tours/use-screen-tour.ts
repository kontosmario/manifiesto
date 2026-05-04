import { useCallback, useEffect, useRef } from 'react'
import { useIsFocused } from '@react-navigation/native'
import { useCopilot } from 'react-native-copilot'
import { triggerHaptic } from '@/lib/haptics'
import { getToursEnabled, getTourSeen, setTourSeen } from './persistence'
import { getTourScrollEntry } from './tour-scroll-registry'
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

interface MeasureRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Promise wrapper around `View.measureInWindow`. Used in place of
 * `measureLayout` so the auto-scroll math works on Fabric without
 * triggering RN's "must be called with a ref to a native component"
 * deprecation warning.
 */
function measureInWindow(
  node: { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null | undefined,
): Promise<MeasureRect | null> {
  if (!node) return Promise.resolve(null)
  return new Promise((resolve) => {
    node.measureInWindow((x, y, width, height) => {
      resolve({ x, y, width, height })
    })
  })
}

/**
 * Auto-starts the screen's guided tour the first time the user
 * lands on it. Marks the tour as "seen" once the user finishes or
 * dismisses the tour.
 *
 * Two implementation notes:
 *
 *   1. The auto-start effect MUST NOT re-run on every render of the
 *      host screen, because each cleanup cancels the pending
 *      `setTimeout` and the next run sees `startedRef.current` is
 *      already true and skips. We avoid this by keeping the effect
 *      deps to stable primitives only and reading the (potentially
 *      unstable) `start()` function via a ref.
 *
 *   2. `copilotEvents.on('stop', ...)` fires for ANY tour that
 *      stops, not just ours. Without filtering, all four tours
 *      would mark themselves as seen the moment the first one
 *      finishes. We track the last active step name and only mark
 *      our own tour as seen when the stopped step belonged to it
 *      (step names are prefixed `<tour>/<order>` by `<TourStep>`).
 *
 *   3. Auto-scroll is implemented here (not via the lib's built-in
 *      `start(_, scrollView)`) because the lib uses `measureLayout`
 *      under the hood, which fires a Fabric deprecation warning
 *      in RN 0.81+. We listen to `stepChange` and use
 *      `measureInWindow` on both the step and the registered
 *      ScrollView to compute the scroll target, then scroll
 *      manually.
 */
export function useScreenTour(
  tour: TourKey,
  { startDelayMs = 600, forceStart = false }: UseScreenTourOptions = {},
): { start: () => Promise<void> } {
  const { copilotEvents, start: copilotStart } = useCopilot()
  const isFocused = useIsFocused()
  const startRef = useRef(copilotStart)
  startRef.current = copilotStart
  const startedRef = useRef(false)
  const lastStepNameRef = useRef<string | undefined>(undefined)

  // Mark the tour as seen on stop, only if our own tour was active.
  // Auto-scroll on stepChange to keep the target visible.
  useEffect(() => {
    const handleStepChange = (
      step:
        | {
            name: string
            wrapperRef?: { current?: unknown }
          }
        | undefined,
    ) => {
      if (!step?.name) return
      lastStepNameRef.current = step.name
      if (!step.name.startsWith(`${tour}/`)) return

      const entry = getTourScrollEntry(tour)
      const scrollView = entry?.scrollView
      const scrollYRef = entry?.scrollYRef
      if (!scrollView || !scrollYRef) return
      const wrapperNode = step.wrapperRef?.current as
        | {
            measureInWindow: (
              cb: (x: number, y: number, w: number, h: number) => void,
            ) => void
          }
        | null
        | undefined
      if (!wrapperNode) return

      // Run the measurements concurrently and scroll once both come
      // back. measureInWindow is the Fabric-friendly path — works
      // identically on the new and old architectures. The
      // ScrollView's class type doesn't surface `measureInWindow`
      // in TS, but the runtime instance does inherit it from the
      // underlying NativeMethods — cast through to call it.
      void Promise.all([
        measureInWindow(wrapperNode),
        measureInWindow(
          scrollView as unknown as {
            measureInWindow: (
              cb: (x: number, y: number, w: number, h: number) => void,
            ) => void
          },
        ),
      ]).then(([stepRect, svRect]) => {
        if (!stepRect || !svRect) return
        // Step's content-Y inside the ScrollView's content view:
        //   stepRect.y is the step's window position
        //   svRect.y is the ScrollView's window position
        //   scrollYRef.current is the current scroll offset
        // → contentY = (stepRect.y - svRect.y) + scrollYRef.current
        const contentY = stepRect.y - svRect.y + scrollYRef.current
        // Place the step ~25% from the top of the visible area.
        const desiredVisibleY = svRect.height * 0.25
        const targetScrollY = Math.max(0, contentY - desiredVisibleY)
        scrollView.scrollTo({ y: targetScrollY, animated: true })
      })
    }

    const handleStop = () => {
      const name = lastStepNameRef.current
      if (name?.startsWith(`${tour}/`)) {
        void setTourSeen(tour)
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
  // enabled flag.
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
        // Don't pass the scrollView — the lib's built-in auto-scroll
        // path uses measureLayout, which warns on Fabric. We do the
        // scroll manually in the stepChange handler above.
        void startRef.current()
      }, startDelayMs)
    })()

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [forceStart, isFocused, startDelayMs, tour])

  const start = useCallback(async () => {
    void triggerHaptic('light')
    await startRef.current()
  }, [])

  return { start }
}
