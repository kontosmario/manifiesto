import { describe, it, expect } from 'vitest'
import {
  BILLING_PLANS,
  BILLING_TRIAL_DAYS,
  getBillingPlan,
} from '@/features/billing/billing-plans'

describe('BILLING_PLANS — constants', () => {
  it('expone planes mensual y anual', () => {
    expect(BILLING_PLANS['hogar-mensual']).toBeDefined()
    expect(BILLING_PLANS['hogar-anual']).toBeDefined()
  })

  it('plan mensual: cycle monthly, memberCap 2, sin ahorro', () => {
    const m = BILLING_PLANS['hogar-mensual']
    expect(m.cycle).toBe('monthly')
    expect(m.memberCap).toBe(2)
    expect(m.savingsPercent).toBe(0)
    expect(m.savingsUsd).toBe(0)
    expect(m.recommended).toBe(false)
  })

  it('plan anual: cycle yearly, memberCap 4, recommended', () => {
    const y = BILLING_PLANS['hogar-anual']
    expect(y.cycle).toBe('yearly')
    expect(y.memberCap).toBe(4)
    expect(y.savingsPercent).toBeGreaterThan(0)
    expect(y.recommended).toBe(true)
  })

  it('anual es más caro absoluto pero más barato efectivo por mes', () => {
    const m = BILLING_PLANS['hogar-mensual']
    const y = BILLING_PLANS['hogar-anual']
    expect(y.priceUsd).toBeGreaterThan(m.priceUsd)
    // Anual / 12 < mensual
    expect(y.priceUsd / 12).toBeLessThan(m.priceUsd)
  })

  it('cada plan trae al menos 5 highlights', () => {
    expect(BILLING_PLANS['hogar-mensual'].highlights.length).toBeGreaterThanOrEqual(5)
    expect(BILLING_PLANS['hogar-anual'].highlights.length).toBeGreaterThanOrEqual(5)
  })

  it('productIds son únicos por plan', () => {
    expect(BILLING_PLANS['hogar-mensual'].productId).not.toBe(
      BILLING_PLANS['hogar-anual'].productId,
    )
  })

  it('savingsUsd anual ~ consistente con 12 × mensual - precio anual', () => {
    const m = BILLING_PLANS['hogar-mensual']
    const y = BILLING_PLANS['hogar-anual']
    const expected = 12 * m.priceUsd - y.priceUsd
    expect(Math.abs(y.savingsUsd - expected)).toBeLessThan(0.05)
  })
})

describe('BILLING_TRIAL_DAYS', () => {
  it('expone trial de 14 días', () => {
    expect(BILLING_TRIAL_DAYS).toBe(14)
  })
})

describe('getBillingPlan', () => {
  it('"monthly" devuelve hogar-mensual', () => {
    expect(getBillingPlan('monthly').id).toBe('hogar-mensual')
  })

  it('"yearly" devuelve hogar-anual', () => {
    expect(getBillingPlan('yearly').id).toBe('hogar-anual')
  })
})
