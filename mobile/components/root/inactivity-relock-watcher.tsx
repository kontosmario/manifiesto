// Inactivity relock watcher — periodic tick that checks if the app
// should re-lock based on foreground inactivity.
//
// Why a tick instead of relying on touch events alone:
//   We need to detect the ABSENCE of interaction. A pure event-driven
//   approach (debounced setTimeout reset on every touch) works but the
//   periodic tick is simpler and survives backgrounding without
//   orphaned timers (RN clears intervals when the JS runtime pauses;
//   on foreground we re-evaluate and lock if needed via the next tick
//   AND via the BackgroundRelockWatcher which fires first on
//   >5min background dwell).
//
// Tick interval: every 30s. Light enough on CPU, fast enough to lock
// within ~15min + 30s tolerance.
//
// Sprint R-2 (2026-06-10).

import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import type { AppStateStatus } from 'react-native'
import { isAppUnlocked } from '@/features/auth/app-lock-state'
import { dispatchAuthFlow } from '@/features/auth-flow/auth-flow-controller'
import {
  INACTIVITY_THRESHOLD_MS,
  getLastInteractionAt,
  recordInteraction,
  shouldLockForInactivity,
} from '@/features/auth/inactivity-tracker'

const TICK_INTERVAL_MS = 30 * 1000

export function InactivityRelockWatcher() {
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)

  useEffect(() => {
    const stateSub = AppState.addEventListener('change', (next) => {
      appStateRef.current = next
      // Foreground arrival counts as a fresh interaction so we don't
      // lock the user out one tick after they bring the app forward
      // (BackgroundRelockWatcher already handles long-background re-lock
      // via a separate path).
      if (next === 'active') {
        recordInteraction()
      }
    })

    tickRef.current = setInterval(() => {
      const lock = shouldLockForInactivity({
        lastInteractionAt: getLastInteractionAt(),
        now: Date.now(),
        thresholdMs: INACTIVITY_THRESHOLD_MS,
        isUnlocked: isAppUnlocked(),
        appState: appStateRef.current as
          | 'active'
          | 'inactive'
          | 'background'
          | 'unknown'
          | 'extension',
      })
      if (lock) {
        // La máquina auth-flow ejecuta reset-app-lock + navigate('/')
        // + run-probes (re-prompt de FaceID/PIN).
        dispatchAuthFlow({ type: 'RELOCK', source: 'inactivity' })
      }
    }, TICK_INTERVAL_MS)

    return () => {
      stateSub.remove()
      if (tickRef.current) {
        clearInterval(tickRef.current)
        tickRef.current = null
      }
    }
  }, [])

  return null
}
