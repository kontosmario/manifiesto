// Takeover offline GLOBAL — heredero del rol app-wide que cumplía
// `showAuthTransitionError('network')` en el store viejo.
//
// Es deliberadamente independiente de la máquina auth-flow: estar
// offline no es un estado del viaje de autenticación, es un estado del
// device que puede ocurrir en cualquier pantalla. El TransitionOverlay
// lee AMBAS fuentes y renderiza el mismo fallback de error; el botón
// Reintentar decide a quién avisar (RETRY a la máquina si el viaje
// estaba en bridge-error, hide aquí si fue takeover global).
//
// El GlobalConnectivityWatcher (debounce 2.5s + resume grace 3s) es el
// único emisor de show; hide ocurre al volver online (watcher) o al
// Reintentar exitoso.

import { useSyncExternalStore } from 'react'

let visible = false
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function showOfflineTakeover() {
  if (visible) return
  visible = true
  notify()
}

export function hideOfflineTakeover() {
  if (!visible) return
  visible = false
  notify()
}

export function isOfflineTakeoverVisible() {
  return visible
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => visible

export function useOfflineTakeover() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
