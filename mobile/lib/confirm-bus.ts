// Pub/sub mínimo para confirmaciones neo. Misma topología que
// `toast-bus`: un único listener (NeoConfirmHost, montado en
// app-stack-shell) consume el stream y los productores llaman a
// `neoConfirm(...)` desde donde sea.
//
// Por qué imperativo y no un componente: reemplaza a `Alert.alert`, que
// es una API global del SO. Sus call sites viven dentro de callbacks y
// de `onError` de mutaciones que pueden resolver DESPUÉS de que la
// pantalla se desmontó — un `<ConfirmSheet visible={...}>` local se
// desmontaría con ella y la pregunta se perdería en silencio. El host
// global sobrevive igual que sobrevivía el diálogo del sistema.

export type ConfirmTone = 'destructive' | 'irreversible' | 'neutral'

export interface ConfirmRequest {
  id: string
  title: string
  message?: string
  /** Texto del botón que confirma. Default: `common:actions.confirm`. */
  confirmLabel?: string
  /** Texto del botón que cancela. Default: `common:actions.cancel`. */
  cancelLabel?: string
  /**
   * Tinta del CTA. `destructive` → rojo "excedido" (borrar algo);
   * `irreversible` → naranja de alerta (escrituras que no se deshacen
   * pero no borran nada, como anclar el ciclo al confirmar el cobro);
   * `neutral` → verde de acción.
   */
  tone: ConfirmTone
  resolve: (confirmed: boolean) => void
}

type Listener = (request: ConfirmRequest) => void

const listeners = new Set<Listener>()
let counter = 0

export interface NeoConfirmOptions {
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
}

/**
 * Abre una confirmación neo y resuelve con `true` si el usuario
 * confirma. Cancelar, tocar el scrim, arrastrar la hoja hacia abajo y
 * el botón físico de Android resuelven todos `false` — la salida segura
 * es siempre no hacer nada, igual que en el Alert nativo.
 *
 * Sin host montado resuelve `false` en vez de colgarse: un `await` que
 * nunca resuelve dejaría la mutación esperando para siempre.
 */
export function neoConfirm(
  title: string,
  opts?: NeoConfirmOptions,
): Promise<boolean> {
  if (listeners.size === 0) return Promise.resolve(false)
  counter += 1
  const id = `${Date.now()}-${counter}`
  return new Promise<boolean>((resolve) => {
    let settled = false
    const once = (confirmed: boolean) => {
      if (settled) return
      settled = true
      resolve(confirmed)
    }
    const request: ConfirmRequest = {
      id,
      title,
      message: opts?.message,
      confirmLabel: opts?.confirmLabel,
      cancelLabel: opts?.cancelLabel,
      tone: opts?.tone ?? 'neutral',
      resolve: once,
    }
    listeners.forEach((l) => {
      l(request)
    })
  })
}

export function subscribeConfirm(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
