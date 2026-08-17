import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { glowSafeTextShadow } from '@/theme/text-glow'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('glowSafeTextShadow — el halo tiene lienzo donde dibujarse', () => {
  it('reserva al menos el radio del blur en padding', () => {
    const s = glowSafeTextShadow({
      color: 'rgba(150,230,160,0.3)',
      radius: 26,
      offset: { width: 0, height: 0 },
    })
    expect(s.padding).toBeGreaterThanOrEqual(26)
    expect(s.textShadowRadius).toBe(26)
  })

  it('el margen negativo compensa EXACTO el padding (layout intacto)', () => {
    const s = glowSafeTextShadow({
      color: '#fff',
      radius: 26,
      offset: { width: 0, height: 0 },
    })
    expect(s.margin).toBe(-(s.padding as number))
  })

  it('suma el offset al alcance: una sombra corrida necesita más lienzo', () => {
    const centrada = glowSafeTextShadow({
      color: '#fff',
      radius: 8,
      offset: { width: 0, height: 0 },
    })
    const corrida = glowSafeTextShadow({
      color: '#fff',
      radius: 8,
      offset: { width: 0, height: 2 },
    })
    expect(corrida.padding as number).toBeGreaterThan(centrada.padding as number)
  })

  it('redondea hacia arriba (un radio fraccionario nunca queda corto)', () => {
    const s = glowSafeTextShadow({
      color: '#fff',
      radius: 25.4,
      offset: { width: 0, height: 0 },
    })
    expect(s.padding).toBe(26)
  })
})

/**
 * Guarda de regresión: los sitios con halo CLARO y radio grande son los que
 * producen el rectángulo. Si alguien vuelve a escribir el trío
 * `textShadowColor/Offset/Radius` a mano en ellos, el recorte vuelve.
 */
describe('los halos grandes pasan por el helper, no a mano', () => {
  const sitios = [
    'mobile/components/redesign/gastos/gastos-screen.tsx',
    'mobile/components/redesign/jardin/cierre-screen.tsx',
  ]
  for (const sitio of sitios) {
    it(`${sitio} no arma el textShadow a mano`, () => {
      const src = read(sitio)
      expect(src).not.toMatch(/textShadowRadius:\s*s\./)
      expect(src).toMatch(/glowSafeTextShadow/)
    })
  }
})
