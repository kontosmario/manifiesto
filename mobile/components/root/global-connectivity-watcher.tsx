// Global connectivity watcher.
//
// Promotes the auth-transition splash into its `error('network')`
// fallback when the device goes offline, and dismisses the fallback
// when connectivity comes back. Renders nothing of its own.
//
// Why a hard fallback instead of an inline chip?
//   - One source of truth across every screen.
//   - Prevents users from running mutations that would silently fail.
//   - Removes a class of "stale data" confusion.
//
// Why DEBOUNCE the offline state (added 2026-05-09)?
//   The previous version flipped the splash to error mode the moment
//   `isOnline` went false. That created a recurring annoying UX:
//   every time the app came back from background, NetInfo briefly
//   reports offline (the OS suspends the radio while backgrounded),
//   and the user saw "Sin conexión a internet" + Reintentar for half
//   a second before NetInfo recovered and the watcher dismissed the
//   fallback automatically. The recovery was automatic but the flash
//   was confusing and made the app feel broken.
//
//   Now: we wait `OFFLINE_DEBOUNCE_MS` (2.5s) of CONTINUOUS offline
//   before promoting the splash. Real outages persist; resume-flicker
//   does not. We also extend that wait to `RESUME_GRACE_MS` (3s) when
//   the app just became active — that's the window where false-
//   offline reports are most likely (NetInfo stale snapshot).

import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { useOnlineStatus } from '@/hooks/use-online-status'
import {
  hideOfflineTakeover,
  showOfflineTakeover,
  useOfflineTakeover,
} from '@/features/auth-flow/offline-takeover'

const OFFLINE_DEBOUNCE_MS = 2500 // require offline to persist this long
const RESUME_GRACE_MS = 3000 // longer wait when within this many ms of foregrounding

export function GlobalConnectivityWatcher() {
  const isOnline = useOnlineStatus()
  const takeoverVisible = useOfflineTakeover()

  // Tracks the last time the app transitioned to 'active'. We use it
  // to compute "are we still inside the resume grace window?".
  // Initialised null so React's purity rule is satisfied; we set it
  // to `Date.now()` on mount in the AppState effect below. While
  // null (very early in mount), `sinceResume` evaluates as if the
  // app just became active — same effective behaviour.
  const lastActiveAtRef = useRef<number | null>(null)
  // Pending offline-promotion timer. Cleared when offline flips back
  // to online before it fires.
  const offlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track foreground transitions so the watcher can apply a grace
  // period right after resume. Also seed `lastActiveAtRef` on first
  // mount (we treat first mount as effectively a fresh foreground —
  // any offline state at that moment is the legitimate cold-start
  // signal, but we still want a small grace window).
  useEffect(() => {
    lastActiveAtRef.current = Date.now()
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        lastActiveAtRef.current = Date.now()
        // Cancel any pending offline-promotion that was queued up
        // during the background window — it's based on stale state.
        if (offlineTimerRef.current) {
          clearTimeout(offlineTimerRef.current)
          offlineTimerRef.current = null
        }
      }
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (!isOnline) {
      // We just went offline. Don't promote the splash immediately —
      // wait at least OFFLINE_DEBOUNCE_MS, more if we're inside the
      // resume grace window. Real outages keep the timer alive
      // through the wait; transient blips clear it via the cleanup.
      const sinceResume = Date.now() - (lastActiveAtRef.current ?? Date.now())
      const remainingGrace = Math.max(0, RESUME_GRACE_MS - sinceResume)
      const delay = Math.max(OFFLINE_DEBOUNCE_MS, remainingGrace)

      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current)
      offlineTimerRef.current = setTimeout(() => {
        offlineTimerRef.current = null
        showOfflineTakeover()
      }, delay)

      return () => {
        if (offlineTimerRef.current) {
          clearTimeout(offlineTimerRef.current)
          offlineTimerRef.current = null
        }
      }
    }

    // We're online — cancel any pending promotion that was about to
    // fire from a transient blip.
    if (offlineTimerRef.current) {
      clearTimeout(offlineTimerRef.current)
      offlineTimerRef.current = null
    }

    // Came back online while the user was staring at the network
    // error fallback. Auto-dismiss so the underlying screen reveals.
    // Los estados de la máquina auth-flow (bridge-error de un viaje en
    // curso) NO se tocan acá — su retry es responsabilidad del botón
    // Reintentar (evento RETRY).
    if (takeoverVisible) {
      hideOfflineTakeover()
    }
  }, [isOnline, takeoverVisible])

  return null
}
