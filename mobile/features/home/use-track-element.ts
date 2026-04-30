// Per-element tracker hook for Home surfaces.
//
// Pairs with `useHomeTelemetry` (the session-level hook): each
// surface that wants to be measured calls `useTrackElement` with its
// stable `elementId` + `slot`, and gets back `{ onTap, onDismiss }`
// callbacks to wire into press / dismiss handlers.
//
// The hook auto-emits `home.element_shown` once per mount when the
// element becomes visible. Subsequent re-renders don't re-emit —
// "shown" tracks first appearance in the current Home session.

import { useEffect, useMemo, useRef } from 'react'
import {
  logHomeEvent,
  type HomeElementId,
  type HomeSlot,
} from '@/features/home/log-home-event'

// Session-scoped memory of which (sessionId, elementId) combos have
// already fired `home.element_shown`. Lives at module level so a
// surface that conditionally re-mounts (e.g. forecast chip that hides
// when data is missing and re-appears when it loads) doesn't re-fire
// the event and inflate `shown_count` per session.
//
// Cleared lazily — entries for old sessions remain until process
// restart. The Set never grows past `O(sessions × elements)` per
// process, which is bounded for a single user.
const SHOWN_KEYS = new Set<string>()
const shownKey = (sessionId: string, elementId: HomeElementId) =>
  `${sessionId}:${elementId}`

interface TrackArgs {
  familyId: string | undefined
  /** From `useHomeTelemetry().sessionId`. Required so analytics can
   *  group per-element events back to the parent session. */
  sessionId: string
  elementId: HomeElementId
  slot: HomeSlot
  /** Whether the element is currently visible. For now defaults to
   *  `true` (mount = visible). Future iterations can hook into
   *  IntersectionObserver-style viewport detection. */
  isVisible?: boolean
}

interface DismissReason {
  /** How the user dismissed: swipe gesture vs explicit X button. */
  reason: 'swipe' | 'x_button'
}

export interface TrackedElementHandle {
  /** Wire to the element's `onPress` (or equivalent). The
   *  `destinationRoute` is optional — pass it if the tap navigates
   *  somewhere so analytics can compute derived navigation rate. */
  onTap: (destinationRoute?: string) => void
  /** Only meaningful for dismissable banners (S7). No-op for other
   *  surfaces. */
  onDismiss: (args: DismissReason) => void
}

export function useTrackElement(args: TrackArgs): TrackedElementHandle {
  const visible = args.isVisible ?? true
  const shownAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (!args.familyId) return
    if (!visible) return
    // Guard: if the parent didn't have a sessionId yet (e.g. telemetry
    // hook hadn't mounted, or the parent passes the empty-string
    // fallback), skip the event entirely. Otherwise we'd dirty the
    // analytics with `session_id=""` rows that don't correlate to any
    // real session.
    if (!args.sessionId) return
    const key = shownKey(args.sessionId, args.elementId)
    if (SHOWN_KEYS.has(key)) {
      // Already fired in this session — skip (re-mount of a
      // conditionally-rendered surface).
      if (shownAtRef.current == null) shownAtRef.current = Date.now()
      return
    }
    SHOWN_KEYS.add(key)
    shownAtRef.current = Date.now()
    void logHomeEvent({
      familyId: args.familyId,
      event: 'home.element_shown',
      elementId: args.elementId,
      slot: args.slot,
      context: { session_id: args.sessionId },
    })
  }, [args.familyId, args.elementId, args.slot, args.sessionId, visible])

  // Memoize the handle so the parent's `memo()` wrappers don't churn
  // every render. The closures here read fresh `args` via the
  // destructured deps below.
  return useMemo<TrackedElementHandle>(() => ({
    onTap: (destinationRoute) => {
      if (!args.familyId || !args.sessionId) return
      void logHomeEvent({
        familyId: args.familyId,
        event: 'home.element_tapped',
        elementId: args.elementId,
        slot: args.slot,
        context: {
          session_id: args.sessionId,
          ms_since_shown: shownAtRef.current
            ? Date.now() - shownAtRef.current
            : null,
          destination_route: destinationRoute ?? null,
        },
      })
    },
    onDismiss: ({ reason }) => {
      if (!args.familyId || !args.sessionId) return
      void logHomeEvent({
        familyId: args.familyId,
        event: 'home.element_dismissed',
        elementId: args.elementId,
        slot: args.slot,
        context: {
          session_id: args.sessionId,
          ms_since_shown: shownAtRef.current
            ? Date.now() - shownAtRef.current
            : null,
          reason,
        },
      })
    },
  }), [args.familyId, args.sessionId, args.elementId, args.slot])
}
