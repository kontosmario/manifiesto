// Background re-lock watcher.
//
// Re-arms the per-launch app-lock when the app returns to foreground
// after more than BACKGROUND_RELOCK_THRESHOLD_MS in background. On
// re-lock it calls resetAppLock() + router.replace('/') so AppEntryGate
// re-decides the destination (Face ID lock screen if biometrics are set
// up, passthrough otherwise — reusing all the existing gate logic).
//
// Why navigate to '/' instead of straight to the lock screen: RequireAuth
// does NOT enforce the app-lock (only AppEntryGate does), so a user on a
// deep screen wouldn't be redirected by resetAppLock() alone. Routing to
// '/' re-runs AppEntryGate, whose cached session/family/profile queries
// make the re-evaluation cheap. Renders nothing of its own.

import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { router } from 'expo-router'
import {
  BACKGROUND_RELOCK_THRESHOLD_MS,
  shouldRelock,
} from '@/features/auth/background-relock'
import { isAppUnlocked, resetAppLock } from '@/features/auth/app-lock-state'

export function BackgroundRelockWatcher() {
  // First timestamp at which the app left 'active' for the current
  // background spell. Null while active. We record the FIRST non-active
  // transition (a control-center peek reports 'inactive' first, then
  // 'background') so the elapsed time measures the whole spell.
  const leftActiveAtRef = useRef<number | null>(null)

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        const relock = shouldRelock({
          leftActiveAt: leftActiveAtRef.current,
          now: Date.now(),
          thresholdMs: BACKGROUND_RELOCK_THRESHOLD_MS,
          isUnlocked: isAppUnlocked(),
        })
        leftActiveAtRef.current = null
        if (relock) {
          resetAppLock()
          // Safe to call router here: this watcher is mounted inside
          // the root Stack (RootLayoutShell), so the router is ready by
          // the time any foreground event fires.
          router.replace('/')
        }
        return
      }
      // 'background' | 'inactive' — record the start of the spell once.
      if (leftActiveAtRef.current === null) {
        leftActiveAtRef.current = Date.now()
      }
    })
    return () => sub.remove()
  }, [])

  return null
}
