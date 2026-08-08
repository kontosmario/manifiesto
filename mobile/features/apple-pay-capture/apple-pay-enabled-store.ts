import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'

const KEY = 'apple_pay_capture_enabled'

interface EnabledSnapshot {
  enabled: boolean
  /**
   * `false` hasta que termina la lectura del keychain. La pantalla de
   * Ajustes deshabilita el switch mientras tanto para que no parpadee de
   * apagado a prendido.
   */
  loaded: boolean
}

/**
 * Store EXTERNO (no `useState` por consumidor) a propósito: el flag lo
 * escribe la pantalla de Ajustes y lo lee el host montado en el layout de
 * tabs, que NO se desmonta al navegar a Ajustes. Con estado local cada
 * hook tendría su propia copia y el host seguiría creyendo que la captura
 * está apagada hasta el próximo arranque de la app.
 */
let snapshot: EnabledSnapshot = { enabled: false, loaded: false }
const listeners = new Set<() => void>()
let hydration: Promise<void> | null = null

function getSnapshot(): EnabledSnapshot {
  return snapshot
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function publish(next: EnabledSnapshot): void {
  snapshot = next
  for (const listener of listeners) listener()
}

/**
 * Una sola lectura del keychain por sesión de app, compartida por todos
 * los consumidores. `getPersistentValue` ya se traga sus propios errores
 * y devuelve `null`, así que la promesa nunca rechaza.
 */
function hydrate(): Promise<void> {
  hydration ??= getPersistentValue(KEY).then((value) => {
    publish({ enabled: value === '1', loaded: true })
  })
  return hydration
}

export function useApplePayCaptureEnabled(): EnabledSnapshot & {
  setEnabled: (next: boolean) => void
} {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    void hydrate()
  }, [])

  const setEnabled = useCallback((next: boolean) => {
    // Optimista: el switch responde en el frame del toque y la escritura
    // en el keychain va detrás. Si fallara, el valor vuelve al del
    // keychain recién en el próximo arranque — aceptable para un flag de
    // UX, y es el mismo criterio del resto de las preferencias locales.
    publish({ enabled: next, loaded: true })
    void setPersistentValue(KEY, next ? '1' : '0')
  }, [])

  return { enabled: state.enabled, loaded: state.loaded, setEnabled }
}
