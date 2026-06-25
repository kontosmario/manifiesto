// Global connectivity watcher.
//
// Promotes the auth-transition splash into its `error('network')`
// fallback when the device is REALLY offline, and dismisses it when
// connectivity comes back. Renders nothing of its own.
//
// Why a hard fallback instead of an inline chip?
//   - One source of truth across every screen.
//   - Prevents users from running mutations that would silently fail.
//   - Removes a class of "stale data" confusion.
//
// Por qué DEBOUNCE + VERIFICACIÓN ACTIVA:
//   NetInfo miente seguido — al volver de background reporta "offline"
//   brevemente (la OS suspende la radio) y su probe por defecto puede quedar
//   stuck en false si esa URL está bloqueada/lenta. El debounce (2.5s, hasta 3s
//   en la ventana de resume) descarta los blips; y ANTES de mostrar la vista
//   hacemos un round-trip REAL (verifyInternetReachable) — solo se muestra si
//   ese chequeo también falla. La verificación en vuelo es CANCELABLE (epoch +
//   AbortSignal) para no mostrar la vista tarde si la conexión ya volvió.

import { useCallback, useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { verifyInternetReachable } from '@/lib/verify-internet-reachable'
import {
  hideOfflineTakeover,
  showOfflineTakeover,
  useOfflineTakeover,
} from '@/features/auth-flow/offline-takeover'

const OFFLINE_DEBOUNCE_MS = 2500 // require offline to persist this long
const RESUME_GRACE_MS = 3000 // longer wait when within this many ms of foregrounding
const RECOVERY_POLL_MS = 5000 // while the takeover shows, re-verify this often

export function GlobalConnectivityWatcher() {
  const isOnline = useOnlineStatus()
  const takeoverVisible = useOfflineTakeover()

  const lastActiveAtRef = useRef<number | null>(null)
  const offlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const verifyAbortRef = useRef<AbortController | null>(null)
  // Espejo de isOnline para que el callback async de la verificación lea la
  // verdad ACTUAL (evita el race "mostrar offline después de volver online").
  const isOnlineRef = useRef(isOnline)
  useEffect(() => {
    isOnlineRef.current = isOnline
  }, [isOnline])

  // Cancela toda promoción pendiente: el timer de debounce Y la verificación
  // activa en vuelo (abortando sus fetches + invalidando su callback). Sin
  // esto, una verificación lanzada podía mostrar la vista DESPUÉS de que la
  // conexión ya había vuelto.
  const cancelPendingPromotion = useCallback(() => {
    if (offlineTimerRef.current) {
      clearTimeout(offlineTimerRef.current)
      offlineTimerRef.current = null
    }
    if (verifyAbortRef.current) {
      verifyAbortRef.current.abort()
      verifyAbortRef.current = null
    }
  }, [])

  // Foreground tracking + cancelación al resumir (la ventana donde NetInfo
  // miente más). Cancela timer Y verificación en vuelo.
  useEffect(() => {
    lastActiveAtRef.current = Date.now()
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        lastActiveAtRef.current = Date.now()
        cancelPendingPromotion()
      }
    })
    return () => sub.remove()
  }, [cancelPendingPromotion])

  // PROMOCIÓN. Depende SOLO de isOnline (cambios de takeoverVisible no
  // reinician el reloj de debounce). Offline persistente → verificación
  // activa → mostrar solo si el round-trip real TAMBIÉN falla y seguimos
  // offline.
  useEffect(() => {
    if (isOnline) {
      cancelPendingPromotion()
      return
    }
    const sinceResume = Date.now() - (lastActiveAtRef.current ?? Date.now())
    const remainingGrace = Math.max(0, RESUME_GRACE_MS - sinceResume)
    const delay = Math.max(OFFLINE_DEBOUNCE_MS, remainingGrace)

    cancelPendingPromotion()
    offlineTimerRef.current = setTimeout(() => {
      offlineTimerRef.current = null
      const controller = new AbortController()
      verifyAbortRef.current = controller
      void verifyInternetReachable({ signal: controller.signal }).then((reachable) => {
        // Guard: si esta verificación fue cancelada/reemplazada (resume,
        // volvió online, unmount), es no-op.
        if (verifyAbortRef.current !== controller) return
        verifyAbortRef.current = null
        // Re-chequeo de la verdad ACTUAL: si NetInfo ya recuperó, no
        // resucitamos la vista con una verificación tardía.
        if (!reachable && !isOnlineRef.current) showOfflineTakeover()
      })
    }, delay)

    return cancelPendingPromotion
  }, [isOnline, cancelPendingPromotion])

  // AUTO-HIDE + auto-recovery. Al volver online, esconde la vista. Mientras
  // esté visible, re-verifica activamente cada RECOVERY_POLL_MS y la esconde
  // si vuelve la conexión — cubre el caso de NetInfo "stuck" offline (no emite
  // el evento online que dispara el hide). El guard inFlight evita
  // verificaciones solapadas en redes lentas.
  useEffect(() => {
    if (isOnline && takeoverVisible) {
      hideOfflineTakeover()
      return
    }
    if (!takeoverVisible) return
    let cancelled = false
    let inFlight = false
    const interval = setInterval(() => {
      if (inFlight) return
      inFlight = true
      void verifyInternetReachable().then((reachable) => {
        inFlight = false
        if (!cancelled && reachable) hideOfflineTakeover()
      })
    }, RECOVERY_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [isOnline, takeoverVisible])

  return null
}
