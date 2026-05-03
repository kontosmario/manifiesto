// Global connectivity watcher.
//
// Replaces the inline / banner offline indicators with a single
// hard-fallback: when NetInfo reports the device is offline we
// promote the auth-transition splash into its `error` phase
// (`errorKind: 'network'`). The splash overlay is mounted at the
// root, blocks the underlying screen via pointerEvents='auto', and
// exposes a "Reintentar" button that probes NetInfo before
// dismissing — so the user can't escape into a half-broken UI while
// the device is still offline.
//
// Why a hard fallback instead of a chip?
//   - One source of truth across every screen (Home, Gastos,
//     Control, Fijos, Settings, modals).
//   - Prevents users from running mutations (save settings, mark
//     fijo paid, submit expense) that would silently fail.
//   - Removes a class of "stale data" confusion — if the splash is
//     up, you know the data isn't live; if it isn't, you can trust
//     the screen.
//
// Renders nothing of its own — the splash overlay in
// `root-layout-shell.tsx` reacts to the state machine flip.

import { useEffect } from 'react'
import { useOnlineStatus } from '@/hooks/use-online-status'
import {
  hideAuthTransitionSplash,
  showAuthTransitionError,
  useAuthTransitionSplash,
} from '@/lib/auth-transition-splash'

export function GlobalConnectivityWatcher() {
  const isOnline = useOnlineStatus()
  const transition = useAuthTransitionSplash()

  useEffect(() => {
    if (!isOnline) {
      // Force the network-error fallback regardless of the previous
      // phase. Idempotent: showAuthTransitionError no-ops when the
      // current state is already `error('network')`.
      showAuthTransitionError('network')
      return
    }

    // Came back online. If the user is currently staring at the
    // `network` error fallback (because the connection dropped
    // earlier and they haven't tapped Reintentar yet), dismiss it
    // automatically — the underlying screen is fine to reveal.
    // Other auth-transition states (`showing`, `success-pending`,
    // or a non-network error like `timeout`) are preserved.
    if (transition.phase === 'error' && transition.errorKind === 'network') {
      hideAuthTransitionSplash()
    }
  }, [isOnline, transition.phase, transition.errorKind])

  return null
}
