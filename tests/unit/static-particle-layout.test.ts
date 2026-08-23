import { describe, expect, it } from 'vitest'
import { buildStaticParticleLayout } from '@/components/brot/static-particle-layout'

describe('buildStaticParticleLayout', () => {
  it('es determinístico: dos llamadas idénticas producen el mismo campo', () => {
    expect(buildStaticParticleLayout(20, 3)).toEqual(buildStaticParticleLayout(20, 3))
  })

  it('todas las posiciones caen en [0, 1) y los tamaños/opacidades en rango', () => {
    for (const p of buildStaticParticleLayout(30, 3)) {
      expect(p.left).toBeGreaterThanOrEqual(0)
      expect(p.left).toBeLessThan(1)
      expect(p.top).toBeGreaterThanOrEqual(0)
      expect(p.top).toBeLessThan(1)
      expect(p.size).toBeGreaterThanOrEqual(3)
      expect(p.size).toBeLessThanOrEqual(7.5)
      expect(p.opacity).toBeGreaterThanOrEqual(0.35)
      expect(p.opacity).toBeLessThanOrEqual(0.75)
    }
  })

  it('cicla la paleta por índice y tolera colorCount 0 sin dividir por cero', () => {
    const specs = buildStaticParticleLayout(5, 3)
    expect(specs.map((p) => p.colorIndex)).toEqual([0, 1, 2, 0, 1])
    expect(buildStaticParticleLayout(3, 0).every((p) => p.colorIndex === 0)).toBe(true)
  })

  it('dispersa de verdad: sin dos partículas en la misma posición (20 muestras)', () => {
    const specs = buildStaticParticleLayout(20, 3)
    const keys = new Set(specs.map((p) => `${p.left.toFixed(4)}:${p.top.toFixed(4)}`))
    expect(keys.size).toBe(20)
  })
})
