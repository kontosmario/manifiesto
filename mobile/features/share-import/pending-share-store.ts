/**
 * Slot único para la captura compartida vía share sheet (share-to-import).
 *
 * La Share Extension despierta la app con una imagen; el listener del
 * root la deposita acá y el ShareImportHost la consume RECIÉN cuando el
 * auth flow está `ready` y los datos del wizard cargaron (decisión
 * spec 2026-06-12: unlock primero, wizard después — la imagen nunca se
 * procesa antes de autenticar; mientras espera solo existe como path).
 *
 * Módulo puro estilo toast-bus: sin React, testeable en node.
 */

type Listener = () => void

let pendingUri: string | null = null
const listeners = new Set<Listener>()

function notify() {
  for (const l of listeners) l()
}

/** Deposita una captura compartida. Si había una sin consumir, la pisa
 *  (el último share gana — v1 es single-slot por spec). */
export function setPendingShare(uri: string): void {
  pendingUri = uri
  notify()
}

/** Lee sin consumir — para gates que deciden si hay trabajo. */
export function peekPendingShare(): string | null {
  return pendingUri
}

/** Entrega y vacía el slot. Null si no había nada. */
export function consumePendingShare(): string | null {
  const uri = pendingUri
  pendingUri = null
  if (uri !== null) notify()
  return uri
}

export function subscribePendingShare(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Solo para tests. */
export function __resetPendingShareForTests(): void {
  pendingUri = null
  listeners.clear()
}
