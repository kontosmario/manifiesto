/**
 * Máquina de estados del gesto del hub Arco.
 *
 * Módulo PURO (cero imports de RN / Reanimated) por dos razones:
 *
 *  1. vitest lo importa bajo su entorno `node`, igual que
 *     `arc-hub-geometry.ts` y `add-expense-tab-button-no-spend-decision.ts`.
 *  2. `Gesture.Pan().minDistance(0)` NO activa en el touch-down: en Android
 *     la activación sólo se alcanza desde un `ACTION_MOVE`, y en iOS desde
 *     `interactionsMoved`. Un toque con el dedo quieto va BEGAN → FAILED, o
 *     sea que `onEnd` nunca corre y el único desenlace común a los tres
 *     caminos (END / FAILED / CANCELLED) es `onFinalize`. Toda la decisión
 *     del soltar vive acá para poder ejercitar esos tres caminos sin device.
 *
 * Las funciones llevan `'worklet'`: el gesto las llama desde el UI thread.
 */

import { ARC_HOLD_MS, ARC_TAP_SLOP } from './arc-hub-geometry'

/** 0 cerrado · 1 arrastre · 2 abierto por tap · 3 disparando. */
export const ARC_PHASE_CLOSED = 0
export const ARC_PHASE_DRAG = 1
export const ARC_PHASE_LATCHED = 2
export const ARC_PHASE_FIRING = 3

export type ArcBeginAction = 'open' | 'close' | 'ignore'

/**
 * Qué hace el touch-down según la fase en la que encuentra al hub.
 *
 * `drag` CIERRA, no ignora. El pan es de un solo puntero, así que un
 * touch-down nuevo mientras el hub se cree en arrastre sólo puede
 * significar que el arrastre anterior se perdió sin resolverse. Con
 * `ignore` esa fase era una TRAMPA sin salida: el arco se queda dibujado a
 * pantalla completa, el host va con `pointerEvents="none"` (durante el
 * arrastre elige el hit-test angular, no el de views) y el FAB tampoco
 * reacciona, porque el `onPress` corta contra `isOpen()`. El usuario queda
 * con un overlay inerte encima de la app y la única salida es reiniciar.
 */
export function decideArcBegin(phase: number): ArcBeginAction {
  'worklet'
  if (phase === ARC_PHASE_CLOSED) return 'open'
  if (phase === ARC_PHASE_FIRING) return 'ignore'
  return 'close'
}

/**
 * Los modos del bus. Viven acá —y no en `arc-hub-bus`— para que el bus
 * pueda importar la máquina sin ciclo: es la máquina la que traduce modo a
 * fase, y esa traducción tiene que ser la MISMA para el host (que la
 * escribe al renderizar) y para el gesto (que la lee al soltar).
 */
export type ArcHubMode = 'closed' | 'drag' | 'latched' | 'firing'

/**
 * Fase equivalente a un modo del bus. El bus es la única fuente de verdad
 * del hub; la fase es el espejo que los worklets pueden leer en el UI
 * thread, nunca una segunda autoridad.
 */
export function arcPhaseForMode(mode: ArcHubMode): number {
  'worklet'
  switch (mode) {
    case 'drag':
      return ARC_PHASE_DRAG
    case 'latched':
      return ARC_PHASE_LATCHED
    case 'firing':
      return ARC_PHASE_FIRING
    default:
      return ARC_PHASE_CLOSED
  }
}

export type ArcReleaseAction = 'fire' | 'latch' | 'close' | 'none'

export interface ArcReleaseInput {
  /** Fase al momento de finalizar el gesto. */
  phase: number
  /**
   * El `success` que RNGH pasa como segundo argumento de `onFinalize`:
   * `true` sólo cuando el handler llegó a ACTIVE y terminó en END.
   * `false` cubre FAILED (el tap sin desplazamiento) y CANCELLED.
   */
  succeeded: boolean
  /** Índice del sector apuntado en `ARC_ORDER`; −1 = pozo. */
  pointedIndex: number
  /** Desplazamiento máximo alcanzado durante el gesto, en puntos. */
  travel: number
  /** Cuánto estuvo el dedo abajo, medido en el UI thread. */
  heldMs: number
}

/**
 * Desenlace del soltar. Un solo lugar, alimentado por `onFinalize`.
 *
 * · Con un sector apuntado se dispara — salvo que el gesto haya sido
 *   CANCELADO por el sistema, donde el dedo nunca se levantó y disparar
 *   sería inventar una intención.
 * · Sin sector, un toque corto y quieto deja el arco abierto (latch). Es el
 *   caso del tap seco, que llega como BEGAN → FAILED.
 * · Todo lo demás cancela: mantener apretado y volver al pozo tiene que
 *   cerrar, que es lo que el usuario pidió con ese recorrido.
 */
export function decideArcRelease(input: ArcReleaseInput): ArcReleaseAction {
  'worklet'
  if (input.phase !== ARC_PHASE_DRAG) return 'none'
  if (input.pointedIndex >= 0) return input.succeeded ? 'fire' : 'close'
  if (input.travel < ARC_TAP_SLOP && input.heldMs < ARC_HOLD_MS) return 'latch'
  return 'close'
}

/** Fase que queda tras resolver el soltar (optimista, antes de que JS conteste). */
export function arcPhaseAfterRelease(
  action: ArcReleaseAction,
  current: number,
): number {
  'worklet'
  if (action === 'fire') return ARC_PHASE_FIRING
  if (action === 'latch') return ARC_PHASE_LATCHED
  if (action === 'close') return ARC_PHASE_CLOSED
  return current
}
