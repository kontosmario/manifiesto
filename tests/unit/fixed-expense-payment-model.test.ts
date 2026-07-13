import { describe, expect, it } from 'vitest'
import { isOptimisticPaymentId } from '@/features/fixed-expenses/fixed-expense-payment.model'

describe('isOptimisticPaymentId', () => {
  it('detecta el id optimista optimistic-<iso>-<fixedExpenseId>', () => {
    // Formato exacto de use-fixed-expenses.ts (optimisticPaymentId)
    expect(
      isOptimisticPaymentId('optimistic-2026-06-04T10:00:00Z-fx-opt'),
    ).toBe(true)
  })

  it('trata un uuid de payment real como NO optimista', () => {
    expect(
      isOptimisticPaymentId('061ecf9d-3385-4c77-8662-d25e0527b6c0'),
    ).toBe(false)
  })

  it('no confunde otros ids sinteticos (temp-) ni strings arbitrarios', () => {
    expect(isOptimisticPaymentId('temp-1783908129165-swsfiz')).toBe(false)
    expect(isOptimisticPaymentId('')).toBe(false)
    expect(isOptimisticPaymentId('pay-1')).toBe(false)
  })
})
