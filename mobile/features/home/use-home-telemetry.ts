// Session-lifecycle telemetry hook for the Home tab.
//
// Mounts inside HomeScreen. Emits the baseline events:
//   home.opened          on mount
//   home.closed          on unmount (with dwell_ms)
//   home.left_without_tap on unmount when no element_tapped fired
//   home.reopened_in_session  when remount within 60s of last unmount
//
// Returns `{ sessionId, markTapped, ... }` so children can correlate
// element-level events to the same session and so the unmount path
// knows whether to fire `left_without_tap`.

import { useEffect, useRef } from 'react'
import { logHomeEvent } from '@/features/home/log-home-event'
import {
  isReopenInSession,
  newSessionId,
} from '@/features/home/home-telemetry-helpers'

export {
  newSessionId,
  REOPEN_THRESHOLD_MS,
  isReopenInSession,
} from '@/features/home/home-telemetry-helpers'

/** Module-level state survives Hot Reload and fast tab switches —
 *  React's StrictMode will mount/unmount twice in dev, and tab
 *  navigation re-mounts the screen. We use plain refs to track the
 *  last unmount so re-mounts within the threshold are correctly
 *  classified as `home.reopened_in_session`. */
let lastUnmountedAt: number | null = null
let lastSessionId: string | null = null

export interface HomeTelemetryHandle {
  /** Stable across the lifetime of the current Home session. Pass to
   *  `useTrackElement` so per-element events correlate. */
  sessionId: string
  /** Children call this when the user has tapped at least one
   *  interactive element. The unmount path uses it to decide whether
   *  to emit `home.left_without_tap`. */
  markTapped: () => void
}

export function useHomeTelemetry(
  familyId: string | undefined,
): HomeTelemetryHandle {
  // Capture re-open state at render time and freeze it for the
  // useEffect — comparing `lastSessionId === sessionId` inside the
  // effect would always be true (we just inherited that id), so the
  // boolean flag is the source of truth for "this mount was a
  // re-open".
  const reopenAtMountRef = useRef<{ isReopen: boolean; gapMs: number }>({
    isReopen: false,
    gapMs: 0,
  })

  // Compute a session id eagerly so the initial render is stable. If
  // we are inside the re-open window, reuse the previous session id —
  // this lets queries treat in-session re-opens as part of the same
  // browse rather than starting fresh sessions.
  const sessionIdRef = useRef<string>(
    (() => {
      const now = Date.now()
      const reopen =
        isReopenInSession(lastUnmountedAt, now) && lastSessionId != null
      reopenAtMountRef.current = {
        isReopen: reopen,
        gapMs: reopen && lastUnmountedAt != null ? now - lastUnmountedAt : 0,
      }
      return reopen ? lastSessionId! : newSessionId()
    })(),
  )
  const mountedAtRef = useRef<number>(Date.now())
  const tappedRef = useRef<boolean>(false)

  useEffect(() => {
    if (!familyId) return

    const sessionId = sessionIdRef.current
    const { isReopen: reopenedFromGap, gapMs } = reopenAtMountRef.current

    // home.reopened_in_session fires BEFORE home.opened so analytics
    // queries can detect "this opened was a re-open" without joining
    // back. Both events share session_id.
    if (reopenedFromGap) {
      void logHomeEvent({
        familyId,
        event: 'home.reopened_in_session',
        context: {
          session_id: sessionId,
          gap_ms: gapMs,
        },
      })
    }

    void logHomeEvent({
      familyId,
      event: 'home.opened',
      context: { session_id: sessionId },
    })

    return () => {
      const dwellMs = Date.now() - mountedAtRef.current
      lastUnmountedAt = Date.now()
      lastSessionId = sessionId

      void logHomeEvent({
        familyId,
        event: 'home.closed',
        context: { session_id: sessionId, dwell_ms: dwellMs },
      })

      if (!tappedRef.current) {
        void logHomeEvent({
          familyId,
          event: 'home.left_without_tap',
          context: { session_id: sessionId, dwell_ms: dwellMs },
        })
      }
    }
  }, [familyId])

  return {
    sessionId: sessionIdRef.current,
    markTapped: () => {
      tappedRef.current = true
    },
  }
}
