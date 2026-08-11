import { describe, expect, it } from 'vitest'
import {
  arcBrotBaseline,
  arcHitTest,
  arcRadius,
  arcSlots,
  arcTrackLength,
  arcTrackPath,
  ARC_BASE_RADIUS,
  ARC_COUNT,
  ARC_DEAD_ZONE,
  ARC_ORDER,
  ARC_REACH_MARGIN,
  ARC_SIZES,
  ARC_SPREAD,
  ARC_STEP,
} from '@/components/navigation/arc-hub-geometry'

/** Ancho de referencia del prototipo aprobado (iPhone 393pt). */
const W = 393
const CX = W / 2
const CY = 760

describe('arcSlots', () => {
  const slots = arcSlots(ARC_BASE_RADIUS)

  it('reparte los cinco pucks con saltos parejos de 36°', () => {
    expect(slots.map((s) => s.angle)).toEqual([-72, -36, 0, 36, 72])
    expect(ARC_STEP).toBe(36)
    expect(slots).toHaveLength(ARC_COUNT)
  })

  it('los cinco quedan al MISMO radio', () => {
    for (const slot of slots) {
      const r = Math.hypot(slot.dx, slot.dy)
      expect(r).toBeCloseTo(ARC_BASE_RADIUS, 6)
    }
  })

  it('es simétrico en espejo alrededor de la vertical', () => {
    expect(slots[0].dx).toBeCloseTo(-slots[4].dx, 6)
    expect(slots[0].dy).toBeCloseTo(slots[4].dy, 6)
    expect(slots[1].dx).toBeCloseTo(-slots[3].dx, 6)
    expect(slots[2].dx).toBeCloseTo(0, 6)
  })

  it('Gasto es el puck principal y está justo arriba del pivote', () => {
    const expense = slots.find((s) => s.key === 'expense')!
    expect(expense.size).toBe(ARC_SIZES.primary)
    expect(expense.angle).toBe(0)
    expect(expense.dy).toBeCloseTo(-ARC_BASE_RADIUS, 6)
  })

  it('deja aire al borde en las puntas a 393pt (el prototipo midió 25,8)', () => {
    const tip = slots[0]
    const clearance = CX + tip.dx - tip.size / 2
    expect(clearance).toBeGreaterThan(20)
    expect(clearance).toBeCloseTo(25.84, 1)
  })

  it('ningún puck pisa la zona muerta ni a su vecino', () => {
    for (const slot of slots) {
      expect(Math.hypot(slot.dx, slot.dy) - slot.size / 2).toBeGreaterThan(ARC_DEAD_ZONE - 1)
    }
    for (let i = 0; i < slots.length - 1; i += 1) {
      const a = slots[i]
      const b = slots[i + 1]
      const gap = Math.hypot(a.dx - b.dx, a.dy - b.dy) - (a.size + b.size) / 2
      expect(gap).toBeGreaterThan(0)
    }
  })

  it('el nombre se apoya arriba del puck y se abre hacia afuera', () => {
    for (const slot of slots) {
      expect(slot.ly).toBeLessThan(slot.dy - slot.size / 2)
      expect(Math.abs(slot.lx)).toBeGreaterThanOrEqual(Math.abs(slot.dx))
      expect(Math.sign(slot.lx || 1)).toBe(Math.sign(slot.dx || 1))
    }
  })

  it('el escalonado va de 0 en el centro a 1 en las puntas', () => {
    expect(slots.map((s) => s.stagger)).toEqual([1, 0.5, 0, 0.5, 1])
  })
})

describe('arcRadius', () => {
  it('conserva el radio nominal en un ancho de 393', () => {
    expect(arcRadius(W, CX)).toBe(ARC_BASE_RADIUS)
  })

  it('lo recorta en una pantalla angosta para no salirse', () => {
    const narrow = 320
    const radius = arcRadius(narrow, narrow / 2)
    expect(radius).toBeLessThan(ARC_BASE_RADIUS)
    const tip = arcSlots(radius)[0]
    expect(narrow / 2 + tip.dx - tip.size / 2).toBeGreaterThanOrEqual(0)
  })

  it('nunca baja del piso que dejaría al puck principal pisando el pozo', () => {
    const radius = arcRadius(200, 100)
    expect(radius).toBeGreaterThanOrEqual(ARC_DEAD_ZONE + ARC_SIZES.primary / 2)
  })
})

describe('arcHitTest', () => {
  const R = ARC_BASE_RADIUS
  const at = (angleDeg: number, dist: number) =>
    arcHitTest(
      CX + dist * Math.sin((angleDeg * Math.PI) / 180),
      CY - dist * Math.cos((angleDeg * Math.PI) / 180),
      CX,
      CY,
      R,
    )

  it('acierta el centro de cada sector', () => {
    for (let i = 0; i < ARC_COUNT; i += 1) {
      expect(at(-ARC_SPREAD / 2 + i * ARC_STEP, R)).toBe(i)
    }
  })

  it('los sectores son contiguos: no hay huecos entre pucks', () => {
    let previous = at(-ARC_SPREAD / 2 - ARC_STEP / 2 + 0.5, R)
    for (let a = -ARC_SPREAD / 2 - ARC_STEP / 2 + 0.5; a <= ARC_SPREAD / 2 + ARC_STEP / 2 - 0.5; a += 0.5) {
      const hit = at(a, R)
      expect(hit).toBeGreaterThanOrEqual(0)
      expect(hit - previous).toBeGreaterThanOrEqual(0)
      previous = hit
    }
    expect(previous).toBe(ARC_COUNT - 1)
  })

  it('la zona muerta cancela', () => {
    expect(at(0, ARC_DEAD_ZONE - 1)).toBe(-1)
    expect(at(0, 0)).toBe(-1)
  })

  it('más allá del alcance máximo tampoco elige', () => {
    expect(at(0, R + ARC_REACH_MARGIN + 1)).toBe(-1)
    expect(at(0, R + ARC_REACH_MARGIN - 1)).toBe(0 + 2)
  })

  it('no se elige por debajo del pivote', () => {
    expect(arcHitTest(CX, CY + 100, CX, CY, R)).toBe(-1)
  })

  it('fuera de la apertura + media tolerancia devuelve -1', () => {
    expect(at(ARC_SPREAD / 2 + ARC_STEP / 2 + 1, R)).toBe(-1)
    expect(at(-(ARC_SPREAD / 2 + ARC_STEP / 2 + 1), R)).toBe(-1)
  })
})

describe('surco y slot de Brot', () => {
  it('el largo del surco cubre la apertura más la sobra de las puntas', () => {
    const length = arcTrackLength(ARC_BASE_RADIUS)
    expect(length).toBeCloseTo(408.4, 0)
  })

  it('el path arranca y termina a la misma altura (simetría)', () => {
    const d = arcTrackPath(CX, CY, ARC_BASE_RADIUS)
    // M ax ay A r r 0 0 1 bx by
    const [, ax, ay, , , , , , , bx, by] = d.split(/\s+/)
    expect(Number(ay)).toBeCloseTo(Number(by), 6)
    expect(Number(ax) - CX).toBeCloseTo(-(Number(bx) - CX), 6)
  })

  it('Brot vive por encima del nombre más alto', () => {
    const baseline = arcBrotBaseline(ARC_BASE_RADIUS)
    const expense = arcSlots(ARC_BASE_RADIUS).find((s) => s.key === 'expense')!
    expect(baseline).toBe(236)
    expect(-baseline).toBeLessThan(expense.ly)
  })
})

describe('catálogo', () => {
  it('el orden visual es izquierda → derecha', () => {
    expect([...ARC_ORDER]).toEqual([
      'import',
      'fixed',
      'expense',
      'income',
      'no-spend',
    ])
  })

  it('Gasto va al centro y las otras dos altas a sus lados', () => {
    const slots = arcSlots(ARC_BASE_RADIUS)
    expect(slots[2].key).toBe('expense')
    expect([slots[1].key, slots[3].key].sort()).toEqual(['fixed', 'income'])
    expect([slots[0].key, slots[4].key].sort()).toEqual(['import', 'no-spend'])
  })

  it('el tamaño lo decide la posición: nunca una punta mayor que su vecina', () => {
    const slots = arcSlots(ARC_BASE_RADIUS)
    expect(slots.map((s) => s.size)).toEqual([
      ARC_SIZES.monthly,
      ARC_SIZES.daily,
      ARC_SIZES.primary,
      ARC_SIZES.daily,
      ARC_SIZES.monthly,
    ])
    // El pacto que sostiene `OUTER_CLEARANCE`: las puntas son las chicas.
    expect(slots[0].size).toBe(ARC_SIZES.monthly)
    expect(slots[4].size).toBe(ARC_SIZES.monthly)
  })

  it('los cinco objetivos táctiles superan los 44pt', () => {
    for (const slot of arcSlots(ARC_BASE_RADIUS)) {
      expect(slot.size).toBeGreaterThanOrEqual(44)
    }
  })
})
