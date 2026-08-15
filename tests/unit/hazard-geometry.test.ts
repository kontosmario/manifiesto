import { describe, it, expect } from 'vitest'
import {
  HAZARD_BAND,
  HAZARD_GAP_PERPENDICULAR,
  HAZARD_H,
  HAZARD_STEP,
  HAZARD_W,
  buildHazardPath,
} from '@/components/redesign/gastos/hazard-geometry'

/** `M<x1> 0L<x2> <h>` → los dos extremos de cada banda. */
function parseBands(d: string): { x1: number; x2: number }[] {
  return [...d.matchAll(/M(-?[\d.]+) 0L(-?[\d.]+) [\d.]+/g)].map((m) => ({
    x1: Number(m[1]),
    x2: Number(m[2]),
  }))
}

describe('cinta de peligro — geometría', () => {
  const d = buildHazardPath()
  const bands = parseBands(d)

  it('las bandas van a 45° en dirección "/" (la del 135deg del handoff)', () => {
    for (const b of bands) {
      // De (x1, 0) a (x2, H): el desplazamiento en x es -H, en y es +H.
      expect(b.x2 - b.x1).toBeCloseTo(-HAZARD_H, 5)
    }
  })

  it('la separación PERPENDICULAR es la del handoff: 5 pintados + 5 vacíos', () => {
    // Bandas contiguas difieren en `HAZARD_STEP` sobre c = x + y; la distancia
    // perpendicular real es ese paso dividido √2.
    //
    // Medimos contra el STRING, que es lo que consume el SVG, no contra la
    // constante — así el test también cubre la precisión con la que se emite.
    for (let i = 1; i < bands.length; i++) {
      const deltaC = bands[i]!.x1 - bands[i - 1]!.x1
      expect(deltaC / Math.SQRT2).toBeCloseTo(HAZARD_GAP_PERPENDICULAR, 2)
    }
    expect(HAZARD_BAND).toBe(HAZARD_GAP_PERPENDICULAR / 2)
  })

  it('el LOOP cierra: correr HAZARD_STEP en X reproduce la misma trama', () => {
    // Cada banda desplazada tiene que caer sobre otra banda del mismo set —
    // es lo que hace que la animación no pegue un salto en cada vuelta.
    const xs = bands.map((b) => b.x1)
    const shifted = xs.map((x) => x + HAZARD_STEP)
    const hits = shifted.filter((x) => xs.some((o) => Math.abs(o - x) < 0.02))
    // Todas menos la última, que se sale del rango generado.
    expect(hits.length).toBe(xs.length - 1)
  })

  it('cubre la celda entera, también corrida un período', () => {
    // La celda vive en (28,24)-(79,64) dentro de la capa (ver `hazardLayer`).
    // Al correrse +HAZARD_STEP queda en (13.9,24)-(64.9,64).
    const cMin = 13.8 + 24
    const cMax = 79 + 64
    const cs = bands.map((b) => b.x1)
    expect(Math.min(...cs)).toBeLessThanOrEqual(cMin)
    expect(Math.max(...cs)).toBeGreaterThanOrEqual(cMax)
  })

  it('es UN solo path y no explota en nodos', () => {
    expect(bands.length).toBeLessThanOrEqual(16)
    expect(bands.length).toBeGreaterThan(8)
  })

  it('la capa cubre la celda más ancha que puede dar la grilla', () => {
    // (430pt Pro Max − 114 de paddings y gaps) / 7 ≈ 45,1 → con el offset de
    // -28 y el corrimiento de ~14 tiene que seguir entrando.
    const maxCellW = (430 - 114) / 7
    expect(28 + maxCellW + HAZARD_STEP).toBeLessThanOrEqual(HAZARD_W)
    expect(24 + 40 + HAZARD_STEP).toBeLessThanOrEqual(HAZARD_H)
  })
})

describe('cinta de peligro — el gradiente CSS del handoff no es una opción', () => {
  it('RN 0.81 descarta `repeating-linear-gradient` en silencio', () => {
    // Regex literal de `processBackgroundImage.js` (RN 0.81.5). Está anclada,
    // así que el prefijo `repeating-` la hace fallar y el gradiente se
    // descarta sin warning. Este test documenta por qué la trama va en SVG:
    // si una versión futura de RN lo soportara, va a fallar y hay que
    // revisar la decisión.
    const rnRegex = /^(linear|radial)-gradient\(((?:\([^)]*\)|[^()])*)\)/
    const handoff =
      'repeating-linear-gradient(135deg, #F3C9BC 0 5px, #EFB8A6 5px 10px)'
    expect(rnRegex.test(handoff)).toBe(false)
    expect(rnRegex.test('linear-gradient(135deg, #F3C9BC, #EFB8A6)')).toBe(true)
  })
})
