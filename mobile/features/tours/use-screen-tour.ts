import { useCallback, useEffect, useRef } from 'react'
import { useIsFocused } from '@react-navigation/native'
import { useIsAuthOverlayVisible } from '@/features/auth-flow/use-auth-flow'
import { triggerHaptic } from '@/lib/haptics'
import { getToursEnabled } from './persistence'
import { useMarkTourSeen } from './use-mark-tour-seen'
import { useToursSeen } from './use-tours-seen'
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
 * The function does two things on top of the scrollTo:
 *
 *   1. Optimistically writes `scrollYRef.current = 0` immediately,
 *      regardless of when the screen's `onScroll` would catch up.
 *      Otherwise on screens with coarse `scrollEventThrottle` the
 *      tour's host still reads the pre-reset Y when it computes
 *      the first step's window position, and the cutout lands
 *      offset by however much the ref was lagging.
 *
 *   2. Waits 360ms (slightly longer than RN's animated scroll
 *      duration) so any in-flight scroll completes and the layout
 *      flushes before the host's first measure runs.
 */
async function resetScrollToTop(tour: TourKey): Promise<void> {
  const entry = getTourScrollEntry(tour)
  if (!entry) return
  // Capture the pre-reset position before we sync the ref so we can
  // decide whether the screen actually needs to animate-scroll.
  const previousY = entry.scrollYRef.current
  // Always sync the tracked ref to 0. Even if we're already at the
  // top, the ref may have stale data from a previous mount; we
  // want the host to start from a known baseline.
  entry.scrollYRef.current = 0
  if (previousY <= 1) {
    // Already at top — no animation needed, no wait needed.
    return
  }
  entry.scrollSvTo(0, true)
  await new Promise<void>((resolve) => setTimeout(resolve, 360))
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
  /**
   * When false, suppress the auto-start effect entirely (caller is
   * still responsible for not calling `start` imperatively). Used to
   * delay the home tour until the user has confirmed the cycle
   * starting balance, so the tour overlay doesn't stack on top of
   * the cycle-balance sheet (iOS Modal glitches when stacked, leaving
   * the tour scrim invisible but touch-blocking).
   * Default true (auto-fires normally).
   */
  enabled?: boolean
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
  { startDelayMs = 600, forceStart = false, enabled = true }: UseScreenTourOptions = {},
): { start: () => Promise<void> } {
  const ctx = useTour()
  const isFocused = useIsFocused()
  // El overlay de transición (bridge auth / offline) es full-screen y
  // se sostiene post-login mientras el destino carga. Si el tour
  // arranca con el overlay arriba, el cutout/tooltip renderizan sobre
  // el logo del splash. Suscribimos su visibilidad para que el
  // auto-start re-evalúe cuando se esconde.
  const splashHidden = !useIsAuthOverlayVisible()
  const toursSeen = useToursSeen()
  // Extract primitives BEFORE the effect so its deps reflect actual
  // changes (true→false) rather than the `toursSeen` object identity
  // (fresh each render). Without this the auto-start effect re-runs
  // on every parent re-render — its cleanup cancels the 600ms timeout,
  // the next run sees `startedRef.current === true` and bails, and
  // the tour never fires.
  const tourSeen = toursSeen.isSeen(tour)
  const toursSeenLoading = toursSeen.isLoading
  const markSeenMutation = useMarkTourSeen()
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
      // Just stopped from being our tour. Mark on the backend (optimistic
      // update keeps `useToursSeen` consistent immediately).
      wasActiveRef.current = false
      markSeenMutation.mutate(tour)
    }
  }, [ctx.activeTour, tour, markSeenMutation])

  // Auto-start on focus.
  useEffect(() => {
    if (!enabled) {
      // Reset so when enabled flips true, the effect can fire fresh.
      startedRef.current = false
      return
    }
    if (!isFocused) {
      startedRef.current = false
      return
    }
    // Wait for the auth-transition splash to dismiss before
    // scheduling the tour. Without this, on first login the tour
    // fires while the splash logo is still on top, and the user
    // sees the tooltip/cutout floating over the brand wordmark.
    if (!splashHidden) return
    if (startedRef.current) return
    startedRef.current = true

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    void (async () => {
      const enabled = await getToursEnabled()
      if (cancelled || !enabled) return
      if (!forceStart) {
        // Wait for the profile load to resolve before deciding. While
        // loading, `tourSeen` is true (conservative — see
        // useToursSeen), so the early-return below already covers
        // that case.
        if (toursSeenLoading) return
        if (tourSeen) return
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
        // Arranque directo. NO envolver en InteractionManager.runAfterInteractions:
        // ese callback se posterga hasta que drenen los interaction-handles (dismiss
        // del Modal de la sheet, toques) y, peor, la tormenta de re-renders post-
        // confirmar-sueldo re-ejecuta este effect → el cleanup pone cancelled=true y
        // el callback diferido aborta → el tour NUNCA arranca (regresión 2026-06-23).
        // Contra el race modal-chain del header alcanza con el scrim escapable del
        // TourHost (tap-to-dismiss), sin sacrificar el disparo del tour.
        ctxRef.current.start(tour)
      }, startDelayMs)
    })()

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [enabled, forceStart, isFocused, splashHidden, startDelayMs, tour, tourSeen, toursSeenLoading])

  const start = useCallback(async () => {
    void triggerHaptic('light')
    await resetScrollToTop(tour)
    ctxRef.current.start(tour)
  }, [tour])

  return { start }
}
