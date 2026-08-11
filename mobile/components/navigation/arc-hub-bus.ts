import { useEffect, useState } from 'react'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion'
import { ARC_ORDER, type ArcActionKey } from './arc-hub-geometry'
import { createArcBrotPicker, ARC_BROT_COUNT } from './arc-brot-messages'
import {
  arcPhaseForMode,
  decideArcRelease,
  ARC_PHASE_DRAG,
  type ArcHubMode,
  type ArcReleaseAction,
  type ArcReleaseInput,
} from './arc-hub-machine'

/**
 * Bus del hub Arco — el estado JS que el FAB escribe y el host de raíz
 * lee. Mismo patrón que `lib/toast-bus` / `lib/confetti-bus`: un store de
 * módulo con listeners, sin contexto de React.
 *
 * Existe porque las dos mitades del hub viven en subárboles DISTINTOS: el
 * gesto nace en el FAB (adentro del `<Stack>`, en la barra de tabs) y el
 * dibujo ocurre en un host hermano del `<Stack>`. Pasar los `onPress`
 * reales por acá deja `NoSpendConfirmSheet`, `ImportReviewSheet` y los
 * `router.push` donde ya están, en `add-expense-tab-button.tsx`.
 *
 * El catálogo de acciones NO se copia al store: se registra un accessor y
 * se lee al ABRIR. Así el arco siempre ve el estado fresco (p. ej. si el
 * día sin gasto ya está marcado) sin que cada render del FAB tenga que
 * emitir.
 */

export interface ArcHubAction {
  key: ArcActionKey
  /** Nombre LARGO ("Día sin gasto"): el del lector de pantalla. El nombre
   *  corto que se dibuja en el arco sale de `states:arcHub.short.*`. */
  label: string
  onPress: () => void
  visualState?: 'default' | 'marked'
}

export type { ArcHubMode }

export interface ArcHubSnapshot {
  mode: ArcHubMode
  /** Centro del disco del FAB, en coordenadas de VENTANA. */
  cx: number
  cy: number
  pointed: ArcActionKey | null
  fired: ArcActionKey | null
  actions: ArcHubAction[]
  /** El arco se retira SIN animación de salida (ver `ARC_ROUTE_ACTIONS`). */
  instant: boolean
  /**
   * Índice en `ARC_BROT_MESSAGES`: qué Brot y qué mensajito toca esta vez.
   *
   * Se sortea en `open()` —el embudo por el que pasan las DOS maneras de
   * abrir— y no se vuelve a tocar hasta la próxima apertura. Que viva en el
   * snapshot y no en el host es lo que lo hace estable: el host se
   * re-renderiza con cada cambio de sector apuntado, y sorteando ahí Brot
   * cambiaría de cara mientras el dedo recorre el arco.
   */
  brot: number
}

/**
 * Acciones que empujan una ruta. En Android las altas se presentan como
 * `card`, o sea que la pantalla nueva entra ADENTRO del ScreenStack —
 * debajo del host del arco, que es su hermano con `zIndex` más alto. Si el
 * arco se quedara el anillo de confirmación entero, el alta se vería
 * deslizando por debajo del scrim. Para estas cinco décimas de segundo el
 * arco no aporta nada: la transición de ruta ES la confirmación.
 */
const ARC_ROUTE_ACTIONS = new Set<ArcActionKey>(['expense', 'income', 'fixed'])

/**
 * Cuánto vive el arco después de disparar. La acción se despacha en el
 * mismo tick que el soltar (el prototipo esperaba 460ms, que le sumaba
 * casi medio segundo a la interacción más repetida de la app); esta
 * ventana es sólo la del anillo de confirmación, que corre POR DEBAJO de
 * la transición de ruta — posible porque el arco no es un `<Modal>`.
 */
export const ARC_FIRE_MS = motionDurations.standard

const EMPTY: ArcHubAction[] = []

type Listener = (snapshot: ArcHubSnapshot) => void

let snapshot: ArcHubSnapshot = {
  mode: 'closed',
  cx: 0,
  cy: 0,
  pointed: null,
  fired: null,
  actions: EMPTY,
  instant: false,
  brot: 0,
}

const brotPicker = createArcBrotPicker(ARC_BROT_COUNT)

const listeners = new Set<Listener>()
let provideActions: (() => ArcHubAction[]) | null = null
let fireTimer: ReturnType<typeof setTimeout> | null = null

/**
 * El host vive adentro del gate `userId && familyId` de `AppStackShell`,
 * pero el provider envuelve el árbol entero. Si la familia desaparece
 * (el dueño elimina el hogar desde otro device) el host se desmonta y sin
 * esta señal el gesto seguiría corriendo INVISIBLE. El FAB lee esto para
 * decidir si el arco participa.
 */
let hostMounted = false
const hostListeners = new Set<(mounted: boolean) => void>()

function commit(patch: Partial<ArcHubSnapshot>) {
  snapshot = { ...snapshot, ...patch }
  for (const listener of listeners) listener(snapshot)
}

/** Ordena el catálogo del FAB según `ARC_ORDER` (izquierda → derecha). */
function readActions(): ArcHubAction[] {
  const list = provideActions?.() ?? EMPTY
  const byKey = new Map(list.map((action) => [action.key, action]))
  const ordered: ArcHubAction[] = []
  for (const key of ARC_ORDER) {
    const action = byKey.get(key)
    if (action) ordered.push(action)
  }
  return ordered
}

/**
 * El FAB publica un accessor (no el array): se lo llama al abrir, así el
 * arco lee las etiquetas y el `visualState` del render vigente.
 */
export function registerArcHubActions(getActions: () => ArcHubAction[]): () => void {
  provideActions = getActions
  return () => {
    if (provideActions === getActions) provideActions = null
  }
}

export const arcHub = {
  /** `cx`/`cy` en coordenadas de ventana (centro del disco del FAB). */
  open(cx: number, cy: number, mode: 'drag' | 'latched'): void {
    if (snapshot.mode !== 'closed') return
    const actions = readActions()
    if (actions.length === 0) return
    commit({
      mode,
      cx,
      cy,
      pointed: null,
      fired: null,
      actions,
      instant: false,
      brot: brotPicker.next(),
    })
    void triggerHaptic('light')
  },

  /** Tap seco: el arco queda abierto y se elige con un toque. */
  latch(): void {
    if (snapshot.mode !== 'drag') return
    commit({ mode: 'latched', pointed: null })
  },

  point(key: ArcActionKey | null): void {
    if (snapshot.mode !== 'drag' && snapshot.mode !== 'latched') return
    if (snapshot.pointed === key) return
    commit({ pointed: key })
    if (key) void triggerHaptic('selection')
  },

  close(): void {
    if (fireTimer) {
      clearTimeout(fireTimer)
      fireTimer = null
    }
    if (snapshot.mode === 'closed') return
    commit({ mode: 'closed', pointed: null, fired: null, instant: false })
  },

  /**
   * Estado TERMINAL: despacha la acción real y ya no acepta gestos. El
   * temporizador vive acá (y no en el host) para que el estado no quede
   * clavado en `firing` si el host se desmonta a mitad de la salida.
   */
  fire(key: ArcActionKey): void {
    if (snapshot.mode !== 'drag' && snapshot.mode !== 'latched') return
    const action = snapshot.actions.find((candidate) => candidate.key === key)
    if (!action) {
      arcHub.close()
      return
    }
    if (ARC_ROUTE_ACTIONS.has(key)) {
      commit({ mode: 'closed', pointed: null, fired: null, instant: true })
      void triggerHaptic('selection')
      action.onPress()
      return
    }
    commit({ mode: 'firing', pointed: key, fired: key, instant: false })
    void triggerHaptic('selection')
    action.onPress()
    if (fireTimer) clearTimeout(fireTimer)
    fireTimer = setTimeout(() => {
      fireTimer = null
      arcHub.close()
    }, ARC_FIRE_MS)
  },

  /**
   * Desenlace del soltar, resuelto acá y no en el worklet.
   *
   * La AUTORIDAD es el modo del bus. Antes la decisión se tomaba en el UI
   * thread contra la fase compartida, que tiene DOS escritores — el gesto y
   * el efecto del host — y cuando discrepaban `decideArcRelease` devolvía
   * `'none'`: nadie llamaba a `latch()`, el bus se quedaba en `'drag'` para
   * siempre y el arco quedaba abierto, inerte y sin salida. Con el modo del
   * bus como única referencia, un soltar SIEMPRE deja al hub fuera de
   * `'drag'`, así que esa fase no puede sobrevivir a que el dedo se levante.
   *
   * Es idempotente: un segundo finalize (o uno de un gesto que nunca llegó
   * a abrir el arco) encuentra el modo ya resuelto y no toca nada.
   */
  release(input: Omit<ArcReleaseInput, 'phase'>): ArcReleaseAction {
    if (snapshot.mode !== 'drag') return 'none'
    const action = decideArcRelease({ ...input, phase: ARC_PHASE_DRAG })
    if (action === 'fire' && input.pointedIndex >= 0) {
      arcHub.fire(ARC_ORDER[input.pointedIndex])
    } else if (action === 'latch') {
      arcHub.latch()
    } else {
      arcHub.close()
    }
    return action
  },

  isOpen(): boolean {
    return snapshot.mode !== 'closed'
  },

  /** Fase equivalente al modo vigente, para reconciliar el espejo del UI thread. */
  phase(): number {
    return arcPhaseForMode(snapshot.mode)
  },
}

/** La monta/desmonta `ArcHubHost`. */
export function setArcHubHostMounted(mounted: boolean): void {
  if (hostMounted === mounted) return
  hostMounted = mounted
  for (const listener of hostListeners) listener(mounted)
}

export function useArcHubHostMounted(): boolean {
  const [state, setState] = useState(hostMounted)
  useEffect(() => {
    hostListeners.add(setState)
    if (hostMounted !== state) setState(hostMounted)
    return () => {
      hostListeners.delete(setState)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- suscripción única al montar
  }, [])
  return state
}

/**
 * Sólo "¿hay arco abierto?". Es un hook aparte del snapshot completo porque
 * lo consume el FAB, que se re-renderiza con cada cambio de sector apuntado
 * si se suscribe al snapshot entero. Con el booleano, `setState` corta por
 * igualdad y sólo hay render en las transiciones abierto ↔ cerrado.
 */
export function useArcHubIsOpen(): boolean {
  const [open, setOpen] = useState(() => snapshot.mode !== 'closed')
  useEffect(() => {
    const listener: Listener = (next) => setOpen(next.mode !== 'closed')
    listeners.add(listener)
    // El estado puede haber cambiado entre el render y esta suscripción.
    const current = snapshot.mode !== 'closed'
    if (current !== open) setOpen(current)
    return () => {
      listeners.delete(listener)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- suscripción única al montar
  }, [])
  return open
}

export function useArcHubSnapshot(): ArcHubSnapshot {
  const [state, setState] = useState(snapshot)
  useEffect(() => {
    listeners.add(setState)
    // El estado puede haber cambiado entre el render y esta suscripción.
    if (snapshot !== state) setState(snapshot)
    return () => {
      listeners.delete(setState)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- suscripción única al montar
  }, [])
  return state
}
