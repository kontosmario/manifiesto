import { describe, expect, it } from 'vitest'
import { LOCK_THRESHOLDS } from '@/features/auth/lock-thresholds'

describe('LOCK_THRESHOLDS', () => {
  it('background es 5 minutos', () => {
    expect(LOCK_THRESHOLDS.background).toBe(5 * 60 * 1000)
  })

  it('inactivity es 15 minutos', () => {
    expect(LOCK_THRESHOLDS.inactivity).toBe(15 * 60 * 1000)
  })

  it('sensitiveBackground es 30 segundos', () => {
    expect(LOCK_THRESHOLDS.sensitiveBackground).toBe(30 * 1000)
  })

  it('unlockGrace es 30 segundos', () => {
    expect(LOCK_THRESHOLDS.unlockGrace).toBe(30 * 1000)
  })

  it('sensitiveBackground es estrictamente menor que background', () => {
    expect(LOCK_THRESHOLDS.sensitiveBackground).toBeLessThan(
      LOCK_THRESHOLDS.background,
    )
  })

  it('inactivity es estrictamente mayor que background (UX > strict)', () => {
    expect(LOCK_THRESHOLDS.inactivity).toBeGreaterThan(LOCK_THRESHOLDS.background)
  })

  it('todos los valores son enteros positivos', () => {
    for (const value of Object.values(LOCK_THRESHOLDS)) {
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThan(0)
    }
  })
})
