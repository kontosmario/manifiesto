import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'
import { setCaptureEnabled } from './native'

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
 *
 * Al terminar baja el valor al nativo: el keychain es la fuente de verdad
 * pero el App Intent no lo puede leer (corre en background, sin JS), así
 * que cada arranque re-espeja el flag en `UserDefaults`.
 */
export function hydrateApplePayCaptureEnabled(): Promise<void> {
  hydration ??= getPersistentValue(KEY).then((value) => {
    const enabled = value === '1'
    publish({ enabled, loaded: true })
    setCaptureEnabled(enabled)
  })
  return hydration
}

/**
 * Punto único de escritura del flag: publica al store, persiste en el
 * keychain y espeja al nativo. Los tres tienen que moverse juntos — si el
 * nativo quedara atrás, el intent seguiría capturando y notificando con la
 * feature apagada y nadie drenaría esas capturas.
 */
export function setApplePayCaptureEnabled(next: boolean): void {
  // Optimista: el switch responde en el frame del toque y la escritura
  // en el keychain va detrás. Si fallara, el valor vuelve al del
  // keychain recién en el próximo arranque — aceptable para un flag de
  // UX, y es el mismo criterio del resto de las preferencias locales.
  publish({ enabled: next, loaded: true })
  setCaptureEnabled(next)
  void setPersistentValue(KEY, next ? '1' : '0')
}

export function useApplePayCaptureEnabled(): EnabledSnapshot & {
  setEnabled: (next: boolean) => void
} {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    void hydrateApplePayCaptureEnabled()
  }, [])

  const setEnabled = useCallback((next: boolean) => {
    setApplePayCaptureEnabled(next)
  }, [])

  return { enabled: state.enabled, loaded: state.loaded, setEnabled }
}
