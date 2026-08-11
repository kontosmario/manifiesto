import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// El bus dispara hápticos al abrir y al elegir. Es lo único suyo que toca
// una dependencia nativa; el resto del módulo es estado puro de JS.
vi.mock('@/lib/haptics', () => ({
  triggerHaptic: () => Promise.resolve(),
}))

const { arcHub, registerArcHubActions } = await import(
  '@/components/navigation/arc-hub-bus'
)
const { ARC_ORDER, ARC_HOLD_MS, ARC_TAP_SLOP } = await import(
  '@/components/navigation/arc-hub-geometry'
)
const {
  decideArcBegin,
  ARC_PHASE_CLOSED,
  ARC_PHASE_DRAG,
  ARC_PHASE_LATCHED,
} = await import('@/components/navigation/arc-hub-machine')

/**
 * El bus es la AUTORIDAD del hub Arco: el worklet del gesto sólo le reenvía
 * los hechos del soltar (`success` de RNGH, sector apuntado, desplazamiento
 * máximo y cuánto estuvo el dedo abajo) y el bus decide.
 *
 * Antes decidía el worklet, comparando contra la fase compartida — que
 * tiene DOS escritores, el gesto y el efecto del host. Cuando discrepaban,
 * `decideArcRelease` devolvía 'none', nadie llamaba a `latch()` y el hub se
 * quedaba en 'drag': el arco abierto a pantalla completa, sin recibir
 * toques (durante el arrastre la elección la resuelve el hit-test angular,
 * así que el host va con `pointerEvents="none"`), y con el FAB mudo. El
 * invariante que sostiene este archivo es que eso no puede volver a pasar.
 */

const fired: string[] = []

beforeEach(() => {
  fired.length = 0
  registerArcHubActions(() =>
    ARC_ORDER.map((key) => ({
      key,
      label: key,
      onPress: () => fired.push(key),
    })),
  )
})

afterEach(() => {
  arcHub.close()
})

/** Un tap seco visto por `onFinalize`: BEGAN → FAILED, sin un solo `onUpdate`. */
const DRY_TAP = { succeeded: false, pointedIndex: -1, travel: 0, heldMs: 90 }

/**
 * El MISMO tap seco visto por `onTouchesUp`, que es el camino real en iOS.
 * `succeeded` es `true` porque esa señal significa literalmente "el dedo se
 * levantó" — más preciso que el `success` de RNGH, que ahí ni siquiera
 * llega: un `Pan().minDistance(0)` que no activa muere sin emitir estado
 * (`Possible` mapea a BEGAN y `sendEventsInState` corta por `state !==
 * _lastState`), así que `onFinalize` nunca corre.
 */
const DRY_TAP_TOUCH_UP = {
  succeeded: true,
  pointedIndex: -1,
  travel: 0,
  heldMs: 90,
}

describe('tap seco', () => {
  it('deja el arco en el pozo, listo para elegir con un toque', () => {
    arcHub.open(200, 700, 'drag')
    expect(arcHub.release(DRY_TAP)).toBe('latch')
    expect(arcHub.phase()).toBe(ARC_PHASE_LATCHED)
    expect(arcHub.isOpen()).toBe(true)
  })

  it('por el camino de iOS (onTouchesUp) resuelve igual', () => {
    arcHub.open(200, 700, 'drag')
    expect(arcHub.release(DRY_TAP_TOUCH_UP)).toBe('latch')
    expect(arcHub.phase()).toBe(ARC_PHASE_LATCHED)
  })

  it('el onFinalize tardío de Android no deshace el latch del touch-up', () => {
    // En Android el tap seco SÍ llega a onFinalize (BEGAN → FAILED,
    // success=false), pero los touch events se despachan antes. El segundo
    // en llegar no puede convertir un latch en un cierre.
    arcHub.open(200, 700, 'drag')
    arcHub.release(DRY_TAP_TOUCH_UP)
    expect(arcHub.release({ ...DRY_TAP, heldMs: 400 })).toBe('none')
    expect(arcHub.phase()).toBe(ARC_PHASE_LATCHED)
  })

  it('el toque siguiente sobre el FAB tiene salida', () => {
    arcHub.open(200, 700, 'drag')
    arcHub.release(DRY_TAP)
    expect(decideArcBegin(arcHub.phase())).toBe('close')
  })
})

describe('el modo del bus es la autoridad', () => {
  it('un soltar SIEMPRE saca al hub de drag, decida lo que decida', () => {
    // El caso que rompía en device: cualquier combinación de hechos tiene
    // que resolver. Si alguna dejara 'drag' en pie, el usuario se queda con
    // un overlay inerte encima de la app y sin manera de cerrarlo.
    for (const succeeded of [true, false]) {
      for (const pointedIndex of [-1, 0, 2, 4, Number.NaN]) {
        for (const travel of [0, ARC_TAP_SLOP - 1, ARC_TAP_SLOP, 200]) {
          for (const heldMs of [0, ARC_HOLD_MS - 1, ARC_HOLD_MS, 5000]) {
            arcHub.close()
            arcHub.open(200, 700, 'drag')
            arcHub.release({ succeeded, pointedIndex, travel, heldMs })
            expect(arcHub.phase()).not.toBe(ARC_PHASE_DRAG)
          }
        }
      }
    }
  })

  it('es idempotente: un segundo finalize no deshace el primero', () => {
    arcHub.open(200, 700, 'drag')
    arcHub.release(DRY_TAP)
    expect(arcHub.release(DRY_TAP)).toBe('none')
    expect(arcHub.phase()).toBe(ARC_PHASE_LATCHED)
  })

  it('un finalize de un gesto que nunca abrió el arco no lo cierra', () => {
    // El pan se abstiene cuando todavía no midió el pivote y ahí abre el
    // `onPress` del Pressable, en modo pozo. El finalize de ESE gesto llega
    // igual, y no tiene nada que resolver.
    arcHub.open(200, 700, 'latched')
    expect(arcHub.release(DRY_TAP)).toBe('none')
    expect(arcHub.phase()).toBe(ARC_PHASE_LATCHED)
  })

  it('con el hub cerrado, un finalize tardío no lo abre', () => {
    expect(arcHub.release(DRY_TAP)).toBe('none')
    expect(arcHub.phase()).toBe(ARC_PHASE_CLOSED)
  })
})

describe('arrastre', () => {
  it('soltar sobre un sector dispara ESA acción', () => {
    arcHub.open(200, 700, 'drag')
    const index = ARC_ORDER.indexOf('income')
    expect(
      arcHub.release({
        succeeded: true,
        pointedIndex: index,
        travel: 150,
        heldMs: 800,
      }),
    ).toBe('fire')
    expect(fired).toEqual(['income'])
  })

  it('un gesto CANCELADO por el sistema no dispara nada', () => {
    arcHub.open(200, 700, 'drag')
    expect(
      arcHub.release({
        succeeded: false,
        pointedIndex: ARC_ORDER.indexOf('income'),
        travel: 150,
        heldMs: 800,
      }),
    ).toBe('close')
    expect(fired).toEqual([])
    expect(arcHub.isOpen()).toBe(false)
  })

  it('volver al pozo cancela sin disparar', () => {
    arcHub.open(200, 700, 'drag')
    expect(
      arcHub.release({
        succeeded: true,
        pointedIndex: -1,
        travel: 130,
        heldMs: 900,
      }),
    ).toBe('close')
    expect(fired).toEqual([])
  })
})
