// Pub/sub minimal para toasts transitorios. Un único listener (ToastHost)
// consume el stream; los productores en cualquier parte de la app llaman
// a toast.error / toast.success / toast.info.

export interface ToastPayload {
  id: string
  kind: 'error' | 'success' | 'info'
  message: string
  actionLabel?: string
  onAction?: () => void
  durationMs?: number
}

type Listener = (toast: ToastPayload) => void

const listeners = new Set<Listener>()
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
  counter += 1
  const payload: ToastPayload = {
    id: `${Date.now()}-${counter}`,
    kind,
    message,
    actionLabel: opts?.actionLabel,
    onAction: opts?.onAction,
    durationMs: opts?.durationMs ?? (kind === 'error' ? 6000 : 3000),
  }
  listeners.forEach((l) => {
    l(payload)
  })
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
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
