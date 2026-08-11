import { describe, expect, it } from 'vitest'
import {
  arcPhaseAfterRelease,
  arcPhaseForMode,
  decideArcBegin,
  decideArcRelease,
  ARC_PHASE_CLOSED,
  ARC_PHASE_DRAG,
  ARC_PHASE_FIRING,
  ARC_PHASE_LATCHED,
  type ArcReleaseAction,
} from '@/components/navigation/arc-hub-machine'
import {
  ARC_HOLD_MS,
  ARC_TAP_SLOP,
} from '@/components/navigation/arc-hub-geometry'

/**
 * Simulador del ciclo de vida que RNGH le da a un `Gesture.Pan()`:
 *
 *   · BEGAN → FAILED  · el toque con el dedo QUIETO. `minDistance(0)` no
 *     activa en el touch-down (Android activa desde un `ACTION_MOVE`, iOS
 *     desde `interactionsMoved`), así que `onEnd` NUNCA corre y el único
 *     desenlace es `onFinalize(event, false)`.
 *   · BEGAN → ACTIVE → END · el arrastre normal, `onFinalize(event, true)`.
 *   · BEGAN → ACTIVE → CANCELLED · el sistema se lleva el gesto,
 *     `onFinalize(event, false)` sin que el dedo se haya levantado.
 */
interface Driver {
  phase: number
  pointed: number
  travel: number
  begin: () => 'open' | 'close' | 'ignore'
  move: (options: { hit: number; travel: number }) => void
  finalize: (options: { succeeded: boolean; heldMs: number }) => ArcReleaseAction
}

function driveGesture(initialPhase = ARC_PHASE_CLOSED): Driver {
  const driver: Driver = {
    phase: initialPhase,
    pointed: -1,
    travel: 0,
    begin() {
      const action = decideArcBegin(driver.phase)
      if (action === 'open') {
        driver.phase = ARC_PHASE_DRAG
        driver.pointed = -1
        driver.travel = 0
      }
      if (action === 'close') driver.phase = ARC_PHASE_CLOSED
      return action
    },
    move({ hit, travel }) {
      if (driver.phase !== ARC_PHASE_DRAG) return
      if (travel > driver.travel) driver.travel = travel
      driver.pointed = hit
    },
    finalize({ succeeded, heldMs }) {
      const action = decideArcRelease({
        phase: driver.phase,
        succeeded,
        pointedIndex: driver.pointed,
        travel: driver.travel,
        heldMs,
      })
      driver.phase = arcPhaseAfterRelease(action, driver.phase)
      return action
    },
  }
  return driver
}

describe('decideArcBegin', () => {
  it('con el hub cerrado, el touch-down abre', () => {
    expect(decideArcBegin(ARC_PHASE_CLOSED)).toBe('open')
  })

  it('con el arco en el pozo, el touch-down lo cierra', () => {
    expect(decideArcBegin(ARC_PHASE_LATCHED)).toBe('close')
  })

  it('durante el disparo no reentra', () => {
    expect(decideArcBegin(ARC_PHASE_FIRING)).toBe('ignore')
  })

  it('un touch-down en pleno arrastre CIERRA: el arrastre anterior se perdió', () => {
    // El pan es de un solo puntero, así que esta fase no puede coexistir con
    // un dedo nuevo. Devolver 'ignore' hacía de `drag` una trampa sin
    // salida: arco dibujado a pantalla completa, host sin recibir toques y
    // el FAB mudo — sólo se salía reiniciando la app.
    expect(decideArcBegin(ARC_PHASE_DRAG)).toBe('close')
  })
})

describe('arcPhaseForMode', () => {
  it('traduce cada modo del bus a su fase', () => {
    expect(arcPhaseForMode('closed')).toBe(ARC_PHASE_CLOSED)
    expect(arcPhaseForMode('drag')).toBe(ARC_PHASE_DRAG)
    expect(arcPhaseForMode('latched')).toBe(ARC_PHASE_LATCHED)
    expect(arcPhaseForMode('firing')).toBe(ARC_PHASE_FIRING)
  })
})

describe('BEGAN → FAILED (tap seco, sin ningún move)', () => {
  it('deja el arco abierto en vez de cerrarlo', () => {
    const gesture = driveGesture()
    expect(gesture.begin()).toBe('open')
    // Ni un solo `onUpdate`: el dedo no se movió.
    expect(gesture.finalize({ succeeded: false, heldMs: 90 })).toBe('latch')
    expect(gesture.phase).toBe(ARC_PHASE_LATCHED)
  })

  it('el segundo toque sobre el arco en el pozo lo cierra', () => {
    const gesture = driveGesture()
    gesture.begin()
    gesture.finalize({ succeeded: false, heldMs: 90 })
    expect(gesture.phase).toBe(ARC_PHASE_LATCHED)
    expect(gesture.begin()).toBe('close')
    expect(gesture.phase).toBe(ARC_PHASE_CLOSED)
    // Y con la fase ya baja, `onFinalize` no tiene nada que resolver.
    expect(gesture.finalize({ succeeded: false, heldMs: 40 })).toBe('none')
  })

  it('un toque justo bajo el umbral del hold sigue siendo tap', () => {
    const gesture = driveGesture()
    gesture.begin()
    expect(
      gesture.finalize({ succeeded: false, heldMs: ARC_HOLD_MS - 1 }),
    ).toBe('latch')
  })
})

describe('BEGAN → ACTIVE → END (arrastre)', () => {
  it('dispara el sector apuntado', () => {
    const gesture = driveGesture()
    gesture.begin()
    gesture.move({ hit: 2, travel: 40 })
    gesture.move({ hit: 3, travel: 120 })
    expect(gesture.finalize({ succeeded: true, heldMs: 700 })).toBe('fire')
    expect(gesture.pointed).toBe(3)
    expect(gesture.phase).toBe(ARC_PHASE_FIRING)
  })

  it('mantener apretado y volver al pozo CANCELA (no deja el arco abierto)', () => {
    const gesture = driveGesture()
    gesture.begin()
    gesture.move({ hit: 1, travel: 130 })
    gesture.move({ hit: -1, travel: 130 })
    expect(gesture.finalize({ succeeded: true, heldMs: 900 })).toBe('close')
    expect(gesture.phase).toBe(ARC_PHASE_CLOSED)
  })

  it('un hold largo sin moverse cancela aunque no haya desplazamiento', () => {
    const gesture = driveGesture()
    gesture.begin()
    expect(gesture.finalize({ succeeded: true, heldMs: ARC_HOLD_MS })).toBe(
      'close',
    )
  })

  it('un micro-temblor por debajo de la tolerancia sigue siendo tap', () => {
    const gesture = driveGesture()
    gesture.begin()
    gesture.move({ hit: -1, travel: ARC_TAP_SLOP - 1 })
    expect(gesture.finalize({ succeeded: true, heldMs: 120 })).toBe('latch')
  })

  it('pasada la tolerancia ya no es tap: cancela', () => {
    const gesture = driveGesture()
    gesture.begin()
    gesture.move({ hit: -1, travel: ARC_TAP_SLOP })
    expect(gesture.finalize({ succeeded: true, heldMs: 120 })).toBe('close')
  })
})

describe('CANCELLED (el sistema se lleva el gesto)', () => {
  it('no dispara la acción apuntada: el dedo nunca se levantó', () => {
    const gesture = driveGesture()
    gesture.begin()
    gesture.move({ hit: 4, travel: 150 })
    expect(gesture.finalize({ succeeded: false, heldMs: 800 })).toBe('close')
    expect(gesture.phase).toBe(ARC_PHASE_CLOSED)
  })
})

describe('fases que no participan', () => {
  it('un finalize durante el disparo no toca nada', () => {
    const gesture = driveGesture(ARC_PHASE_FIRING)
    expect(gesture.begin()).toBe('ignore')
    expect(gesture.finalize({ succeeded: true, heldMs: 10 })).toBe('none')
    expect(gesture.phase).toBe(ARC_PHASE_FIRING)
  })

  it('arcPhaseAfterRelease conserva la fase cuando no hubo desenlace', () => {
    expect(arcPhaseAfterRelease('none', ARC_PHASE_LATCHED)).toBe(
      ARC_PHASE_LATCHED,
    )
    expect(arcPhaseAfterRelease('fire', ARC_PHASE_DRAG)).toBe(ARC_PHASE_FIRING)
    expect(arcPhaseAfterRelease('latch', ARC_PHASE_DRAG)).toBe(
      ARC_PHASE_LATCHED,
    )
    expect(arcPhaseAfterRelease('close', ARC_PHASE_DRAG)).toBe(
      ARC_PHASE_CLOSED,
    )
  })
})
