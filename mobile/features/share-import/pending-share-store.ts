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
let lastConsumedUri: string | null = null
const listeners = new Set<Listener>()

function notify() {
  for (const l of listeners) l()
}

/** Deposita una captura compartida. Si había una sin consumir, la pisa
 *  (el último share gana — v1 es single-slot por spec).
 *
 *  Dedupe: la lib puede emitir `onChange` DOS veces para el mismo share
 *  (su refresh interno + nuestro poll de foreground disparan ambos
 *  getShareIntent antes del clear). Re-depositar el uri recién consumido
 *  re-abriría el wizard con la misma captura — lo ignoramos. Un share
 *  genuinamente nuevo siempre tiene otro path (la extensión escribe un
 *  archivo nuevo por share). */
export function setPendingShare(uri: string): void {
  if (uri === lastConsumedUri) return
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
  if (uri !== null) {
    lastConsumedUri = uri
    notify()
  }
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
  lastConsumedUri = null
  listeners.clear()
}
