import { describe, it, expect } from 'vitest'
import {
  heroBalanceRampScale,
  heroBalanceRampT,
} from '@/features/home/hero-balance-ramp'

/**
 * La rampa que acopla la TINTA del monto del hero al valor EN VUELO del
 * contador (pedido del owner 2026-08-13). `t` alimenta un
 * `interpolateColor(t, [0, 0.5, 1], [calma, durazno, terracota])`.
 */
describe('heroBalanceRampT', () => {
  const S = 10_000 // una escala cualquiera (el cupo diario)

  it('el CERO cae exactamente en el stop del medio (durazno)', () => {
    expect(heroBalanceRampT(0, S)).toBe(0.5)
  })

  it('holgado (≥ +1 escala) satura en el extremo calmo', () => {
    expect(heroBalanceRampT(S, S)).toBe(0)
    expect(heroBalanceRampT(S * 50, S)).toBe(0)
  })

  it('pasado (≤ −1 escala) satura en el extremo terracota', () => {
    expect(heroBalanceRampT(-S, S)).toBe(1)
    expect(heroBalanceRampT(-S * 50, S)).toBe(1)
  })

  it('es monótona: cuanto más chico el saldo, más cerca del rojo', () => {
    const muestras = [S, S / 2, 0, -S / 2, -S].map((v) => heroBalanceRampT(v, S))
    for (let i = 1; i < muestras.length; i++) {
      expect(muestras[i]!).toBeGreaterThan(muestras[i - 1]!)
    }
  })

  it('a media escala reparte simétrico alrededor del cero', () => {
    expect(heroBalanceRampT(S / 2, S)).toBeCloseTo(0.25, 5)
    expect(heroBalanceRampT(-S / 2, S)).toBeCloseTo(0.75, 5)
  })

  it('nunca se sale de [0,1] — interpolateColor no clampea el input', () => {
    for (const v of [1e9, -1e9, 0.1, -0.1]) {
      const t = heroBalanceRampT(v, S)
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThanOrEqual(1)
    }
  })
})

describe('heroBalanceRampScale', () => {
  it('usa el cupo diario cuando es el mayor', () => {
    expect(heroBalanceRampScale(50_000, 100_000)).toBe(50_000)
  })

  it('cupo diario 0 (override dinámico tocando piso) NO divide por cero', () => {
    // Sin piso, `value / 0` daría ±Infinity y el color saltaría en seco
    // entre extremos sin tramo intermedio.
    const scale = heroBalanceRampScale(0, 500_000)
    expect(scale).toBeGreaterThan(0)
    expect(Number.isFinite(heroBalanceRampT(250_000, scale))).toBe(true)
  })

  it('mantiene la rampa proporcional con un cupo chico y un saldo grande', () => {
    // 2% de 5.000.000 = 100.000 > cupo 1.000 → gana el proporcional, así el
    // color no queda saturado en el extremo durante casi todo el conteo.
    expect(heroBalanceRampScale(1_000, 5_000_000)).toBe(100_000)
  })

  it('piso absoluto de 1 con todo en cero (hogar recién creado)', () => {
    expect(heroBalanceRampScale(0, 0)).toBe(1)
    expect(heroBalanceRampT(0, heroBalanceRampScale(0, 0))).toBe(0.5)
  })

  it('tolera NaN/undefined del cupo sin romper la rampa', () => {
    const scale = heroBalanceRampScale(Number.NaN, 200_000)
    expect(Number.isFinite(scale)).toBe(true)
    expect(Number.isFinite(heroBalanceRampT(100_000, scale))).toBe(true)
  })
})
