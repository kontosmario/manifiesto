// Generic screen-lifecycle telemetry. Generalizes the patterns from
// `useHomeTelemetry` so any tab can mount it with a `scope` and get:
//
//   {scope}.opened              on mount
//   {scope}.closed              on unmount (with dwell_ms)
//   {scope}.left_without_tap    on unmount when no tap happened
//   {scope}.reopened_in_session when remount within REOPEN_THRESHOLD_MS
//
// The events are stored in the same `home_telemetry` Supabase table
// via the `log_home_event` RPC — the table accepts any event string,
// so adding a `gastos`/`fijos`/`asistente` scope doesn't require a
// schema migration.
//
// Returns `{ sessionId, markTapped }`. Children pass `sessionId` to
// per-element trackers (`useTrackElement`) so their events correlate
// to the same session.

import { useEffect, useRef } from 'react'
import { logScreenEvent } from '@/features/telemetry/log-screen-event'
import {
  isReopenInSession,
  newSessionId,
} from '@/features/home/home-telemetry-helpers'

/** Module-level state, scoped per-screen so two simultaneously-mounted
 *  screens (rare, but possible during animated transitions) don't
 *  cross-contaminate their re-open detection. */
const lastUnmountedAtByScope = new Map<string, number | null>()
const lastSessionIdByScope = new Map<string, string | null>()

export interface ScreenTelemetryHandle {
  /** Stable across the lifetime of the current screen session. */
  sessionId: string
  /** Children call this when the user has tapped at least one
   *  interactive element. The unmount path uses it to decide whether
   *  to emit `{scope}.left_without_tap`. */
  markTapped: () => void
}

interface UseScreenTelemetryArgs {
  scope: string
  familyId: string | undefined
}

export function useScreenTelemetry({
  scope,
  familyId,
}: UseScreenTelemetryArgs): ScreenTelemetryHandle {
  const reopenAtMountRef = useRef<{ isReopen: boolean; gapMs: number }>({
    isReopen: false,
    gapMs: 0,
  })

  const sessionIdRef = useRef<string>(
    (() => {
      const now = Date.now()
      const lastUnmountedAt = lastUnmountedAtByScope.get(scope) ?? null
      const lastSessionId = lastSessionIdByScope.get(scope) ?? null
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

    if (reopenedFromGap) {
      void logScreenEvent({
        familyId,
        event: `${scope}.reopened_in_session`,
        context: { session_id: sessionId, gap_ms: gapMs },
      })
    }

    void logScreenEvent({
      familyId,
      event: `${scope}.opened`,
      context: { session_id: sessionId },
    })

    // Snapshot the ref value at effect-setup time so cleanup uses
    // the mount-time anchor (avoid the cleanup-after-mutation race
    // flagged by exhaustive-deps).
    const mountedAtSnapshot = mountedAtRef.current

    return () => {
      const dwellMs = Date.now() - mountedAtSnapshot
      lastUnmountedAtByScope.set(scope, Date.now())
      lastSessionIdByScope.set(scope, sessionId)

      void logScreenEvent({
        familyId,
        event: `${scope}.closed`,
        context: { session_id: sessionId, dwell_ms: dwellMs },
      })

      if (!tappedRef.current) {
        void logScreenEvent({
          familyId,
          event: `${scope}.left_without_tap`,
          context: { session_id: sessionId, dwell_ms: dwellMs },
        })
      }
    }
  }, [familyId, scope])

  return {
    sessionId: sessionIdRef.current,
    markTapped: () => {
      tappedRef.current = true
    },
  }
}
