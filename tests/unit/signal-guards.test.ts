import { describe, expect, it } from 'vitest'

import {
  allFinite,
  clampFinite,
  finiteOr,
  isFiniteNumber,
  nonNegFinite,
  safeDiv,
} from '@/features/insights/signal-guards'

describe('signal-guards', () => {
  it('isFiniteNumber rechaza NaN/Infinity/no-number', () => {
    expect(isFiniteNumber(5)).toBe(true)
    expect(isFiniteNumber(0)).toBe(true)
    expect(isFiniteNumber(-3.2)).toBe(true)
    expect(isFiniteNumber(NaN)).toBe(false)
    expect(isFiniteNumber(Infinity)).toBe(false)
    expect(isFiniteNumber(-Infinity)).toBe(false)
    expect(isFiniteNumber('5')).toBe(false)
    expect(isFiniteNumber(null)).toBe(false)
    expect(isFiniteNumber(undefined)).toBe(false)
  })

  it('finiteOr devuelve el fallback ante no-finito', () => {
    expect(finiteOr(10, 0)).toBe(10)
    expect(finiteOr(NaN, 0)).toBe(0)
    expect(finiteOr(Infinity, -1)).toBe(-1)
  })

  it('safeDiv: null ante divisor 0 / no finito / resultado no finito', () => {
    expect(safeDiv(10, 2)).toBe(5)
    expect(safeDiv(10, 0)).toBeNull()
    expect(safeDiv(10, NaN)).toBeNull()
    expect(safeDiv(NaN, 2)).toBeNull()
    expect(safeDiv(Infinity, 2)).toBeNull()
    expect(safeDiv(1, Infinity)).toBeNull()
  })

  it('nonNegFinite: clampa a 0, null ante no finito', () => {
    expect(nonNegFinite(5)).toBe(5)
    expect(nonNegFinite(-3)).toBe(0)
    expect(nonNegFinite(NaN)).toBeNull()
    expect(nonNegFinite(Infinity)).toBeNull()
  })

  it('allFinite', () => {
    expect(allFinite(1, 2, 3)).toBe(true)
    expect(allFinite(1, NaN, 3)).toBe(false)
    expect(allFinite()).toBe(true)
  })

  it('clampFinite: rango + fallback al min ante no finito', () => {
    expect(clampFinite(5, 0, 10)).toBe(5)
    expect(clampFinite(-1, 0, 10)).toBe(0)
    expect(clampFinite(99, 0, 10)).toBe(10)
    expect(clampFinite(NaN, 0, 10)).toBe(0)
    expect(clampFinite(Infinity, 2, 10)).toBe(2)
  })
})
