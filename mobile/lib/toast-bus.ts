// Pub/sub minimal para toasts transitorios. Un listener (ToastHost)
// consume el stream; los productores en cualquier parte de la app llaman
// a toast.error / toast.success / toast.info.
//
// El aviso va SÓLO al host más interno (el último suscripto). Misma razón
// que en `confirm-bus`: una toma de pantalla modal monta su propio
// ToastHost porque el de la raíz queda debajo de la ventana nativa, y
// entregar a los dos mostraría el mismo aviso dos veces.

export interface ToastPayload {
  id: string
  kind: 'error' | 'success' | 'info'
  message: string
  actionLabel?: string
  onAction?: () => void
  durationMs?: number
}

type Listener = (toast: ToastPayload) => void

// Pila, no Set: el tope es el host montado dentro de la ventana nativa
// más alta (ver el encabezado).
const listeners: Listener[] = []
let counter = 0

function emit(
  kind: ToastPayload['kind'],
  message: string,
  opts?: {
    actionLabel?: string
    onAction?: () => void
    durationMs?: number
  },
): void {
  const host = listeners[listeners.length - 1]
  if (!host) return
  counter += 1
  const payload: ToastPayload = {
    id: `${Date.now()}-${counter}`,
    kind,
    message,
    actionLabel: opts?.actionLabel,
    onAction: opts?.onAction,
    durationMs: opts?.durationMs ?? (kind === 'error' ? 6000 : 3000),
  }
  host(payload)
}

type ToastOpts = {
  actionLabel?: string
  onAction?: () => void
  durationMs?: number
}

export const toast = {
  error: (message: string, opts?: ToastOpts) => emit('error', message, opts),
  // 2026-05-30: success/info ahora también aceptan actionLabel/onAction
  // para soportar el patrón "Deshacer" en confirmaciones (ej: registrar
  // pago de un fijo). El emit() ya tenía el path; solo expusimos en
  // la API pública.
  success: (message: string, opts?: ToastOpts) =>
    emit('success', message, opts),
  info: (message: string, opts?: ToastOpts) => emit('info', message, opts),
}

export function subscribeToast(listener: Listener): () => void {
  listeners.push(listener)
  return () => {
    const at = listeners.indexOf(listener)
    if (at !== -1) listeners.splice(at, 1)
  }
}
