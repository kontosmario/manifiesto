import { useEffect, useSyncExternalStore } from 'react'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'
import type { PendingCapture } from './types'

const KEY = 'apple_pay_last_capture'

/**
 * Lo que la pantalla de Ajustes necesita para responder "¿esto anda?".
 *
 * Es un SUBCONJUNTO de `PendingCapture` a propósito: el `id` sólo sirve
 * para borrar la entrada de la cola nativa, y acá no se borra nada — esto
 * es un recibo, no una tarea pendiente.
 */
export interface LastApplePayCapture {
  capturedAt: string
  merchantRaw: string
  amountRaw: string
}

interface LastCaptureSnapshot {
  capture: LastApplePayCapture | null
  /** `false` hasta que termina la lectura del keychain. */
  loaded: boolean
}

/**
 * Store EXTERNO por el MISMO motivo que `apple-pay-enabled-store`: acá el
 * que escribe es el host montado en el layout de tabs y el que lee es la
 * pantalla de Ajustes. Con estado local cada uno tendría su copia y la
 * pantalla nunca se enteraría de la captura que acaba de entrar.
 *
 * Y responde una pregunta muy concreta: "¿el dato LLEGA?". Por eso se
 * guarda la captura RECIBIDA, sin importar qué hizo el usuario después
 * con ella — si la confirmó, la salteó o cerró la hoja. Una captura que
 * llegó y se descartó igual prueba que la automatización de Atajos quedó
 * bien armada, que es lo único que este store tiene que demostrar.
 */
let snapshot: LastCaptureSnapshot = { capture: null, loaded: false }
const listeners = new Set<() => void>()
let hydration: Promise<void> | null = null

function getSnapshot(): LastCaptureSnapshot {
  return snapshot
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function publish(next: LastCaptureSnapshot): void {
  snapshot = next
  for (const listener of listeners) listener()
}

/**
 * El keychain guarda texto plano, así que lo que vuelve puede ser
 * cualquier cosa: JSON de una versión anterior del shape, un valor a
 * medio escribir, basura. Se valida campo por campo y ante la duda se
 * devuelve `null` — la pantalla dice "todavía no llegó nada", que es una
 * degradación honesta, en vez de romperse formateando `undefined`.
 */
function parseStored(raw: string | null): LastApplePayCapture | null {
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return null
    const { capturedAt, merchantRaw, amountRaw } = parsed as Record<string, unknown>
    if (typeof capturedAt !== 'string') return null
    if (typeof merchantRaw !== 'string') return null
    if (typeof amountRaw !== 'string') return null
    return { capturedAt, merchantRaw, amountRaw }
  } catch {
    return null
  }
}

/**
 * Orden entre capturas. Una fecha ilegible NO descalifica a la captura
 * (el dato igual llegó, y eso es lo que la pantalla quiere mostrar), pero
 * la deja por debajo de cualquier fecha válida: así una captura rota no le
 * pisa el lugar a una buena.
 */
function rank(capture: LastApplePayCapture | null): number {
  if (capture === null) return -1
  const ms = new Date(capture.capturedAt).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

function pickNewest(captures: readonly PendingCapture[]): LastApplePayCapture | null {
  let newest: LastApplePayCapture | null = null
  for (const capture of captures) {
    const candidate: LastApplePayCapture = {
      capturedAt: capture.capturedAt,
      merchantRaw: capture.merchantRaw,
      amountRaw: capture.amountRaw,
    }
    if (rank(candidate) > rank(newest)) newest = candidate
  }
  return newest
}

/**
 * Una sola lectura del keychain por sesión, compartida por todos los
 * consumidores. `getPersistentValue` se traga sus errores y devuelve
 * `null`, así que la promesa nunca rechaza.
 */
export function hydrateApplePayLastCapture(): Promise<void> {
  hydration ??= getPersistentValue(KEY).then((value) => {
    publish({ capture: parseStored(value), loaded: true })
  })
  return hydration
}

/**
 * Punto único de escritura: lo llama el host cuando el gate le entrega
 * una tanda, ANTES de que el usuario decida nada sobre ella.
 *
 * El registro es MONÓTONO. Las capturas que el usuario no resuelve quedan
 * pendientes y se re-ofrecen en cada vuelta a foreground, así que una
 * tanda posterior puede traer una captura VIEJA sola (la nueva ya se
 * confirmó y se limpió). Sin esta guarda, la pantalla retrocedería a un
 * pago de anteayer y el usuario leería "hace 2 días" justo después de
 * pagar.
 *
 * Se encadena a la hidratación porque la comparación es contra lo
 * persistido: si el host drena antes de que la pantalla haya leído el
 * keychain, publicar de una dejaría a la hidratación pisando la captura
 * recién llegada con la anterior.
 */
export function recordApplePayCaptures(captures: readonly PendingCapture[]): void {
  const newest = pickNewest(captures)
  if (newest === null) return

  void hydrateApplePayLastCapture().then(() => {
    if (rank(newest) <= rank(snapshot.capture)) return
    publish({ capture: newest, loaded: true })
    // Fire-and-forget, mismo criterio que el flag del switch: si la
    // escritura falla se pierde el recibo hasta la próxima captura, que
    // es un costo aceptable para un dato de diagnóstico.
    void setPersistentValue(KEY, JSON.stringify(newest))
  })
}

export function useApplePayLastCapture(): LastCaptureSnapshot {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    void hydrateApplePayLastCapture()
  }, [])

  return state
}
