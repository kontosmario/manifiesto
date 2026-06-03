import { describe, expect, it } from 'vitest'
import { mapToReviewRows } from '../../mobile/features/import-review/map-to-review-rows'
import type { Transaction } from '../../mobile/features/activity-ocr/types'

const TODAY = '2026-06-02'
const RATE = 1000

let _id = 0
const genId = () => `row-${++_id}`
const resetIds = () => {
  _id = 0
}

const ctx = () => ({
  today: TODAY,
  usdToArsRate: RATE,
  generateRowId: genId,
})

const mkTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  merchant: 'LA EUROPEA',
  date: '2026-06-01',
  section: null,
  primaryAmount: { value: 26000, currency: 'ARS', sign: -1 },
  secondaryAmount: null,
  raw: 'LA EUROPEA 01 jun 2026 - 26.000 ARS',
  ...overrides,
})

describe('mapToReviewRows', () => {
  it('maps a basic ARS expense with sign=-1 to kind=expense', () => {
    resetIds()
    const result = mapToReviewRows([mkTx()], ctx())
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      kind: 'expense',
      amount: 26000,
      description: 'LA EUROPEA',
      date: '2026-06-01',
      categoryId: null,
      warnings: [],
    })
    expect(result[0].source.originalCurrency).toBe('ARS')
    expect(result[0].source.appliedRate).toBeNull()
  })

  it('maps an ARS income with sign=+1 to kind=income', () => {
    const result = mapToReviewRows(
      [
        mkTx({
          merchant: 'Cashback',
          primaryAmount: { value: 1500, currency: 'ARS', sign: 1 },
        }),
      ],
      ctx(),
    )
    expect(result[0]).toMatchObject({
      kind: 'income',
      amount: 1500,
      description: 'Cashback',
      incomeKind: 'other',
      categoryId: null,
      warnings: [],
    })
  })

  it('converts USDc amount via the family rate and tags source.appliedRate', () => {
    const result = mapToReviewRows(
      [
        mkTx({
          merchant: 'Crypto buy',
          primaryAmount: { value: 16, currency: 'USDc', sign: -1 },
        }),
      ],
      ctx(),
    )
    expect(result[0].amount).toBe(16000) // 16 × 1000
    expect(result[0].source.originalCurrency).toBe('USDc')
    expect(result[0].source.appliedRate).toBe(1000)
    expect(result[0].warnings).toEqual([])
  })

  it('converts USD and USDT the same way as USDc', () => {
    const result = mapToReviewRows(
      [
        mkTx({ primaryAmount: { value: 10, currency: 'USD', sign: -1 } }),
        mkTx({ primaryAmount: { value: 5, currency: 'USDT', sign: -1 } }),
      ],
      ctx(),
    )
    expect(result[0].amount).toBe(10000)
    expect(result[1].amount).toBe(5000)
  })

  it('tags a foreign currency (EUR/BRL/BTC) with warning and defaults to skip', () => {
    const result = mapToReviewRows(
      [
        mkTx({ primaryAmount: { value: 50, currency: 'EUR', sign: -1 } }),
      ],
      ctx(),
    )
    expect(result[0].kind).toBe('skip')
    expect(result[0].warnings).toContain('foreign-currency')
    expect(result[0].source.appliedRate).toBeNull()
  })

  it('tags a swap (secondaryAmount with different currency) with warning and defaults to skip', () => {
    const result = mapToReviewRows(
      [
        mkTx({
          merchant: 'USDc → ARS',
          primaryAmount: { value: 16, currency: 'USDc', sign: -1 },
          secondaryAmount: { value: 23000, currency: 'ARS', sign: 1 },
        }),
      ],
      ctx(),
    )
    expect(result[0].kind).toBe('skip')
    expect(result[0].warnings).toContain('swap-ambiguous')
  })

  it('handles missing merchant with warning and placeholder description', () => {
    const result = mapToReviewRows([mkTx({ merchant: '' })], ctx())
    expect(result[0].warnings).toContain('no-merchant')
    expect(result[0].description).toBe('(sin descripción)')
  })

  it('handles missing date by falling back to ctx.today + warning', () => {
    const result = mapToReviewRows([mkTx({ date: null })], ctx())
    expect(result[0].warnings).toContain('no-date')
    expect(result[0].date).toBe(TODAY)
  })

  it('handles zero value with warning', () => {
    const result = mapToReviewRows(
      [mkTx({ primaryAmount: { value: 0, currency: 'ARS', sign: -1 } })],
      ctx(),
    )
    expect(result[0].warnings).toContain('value-zero')
    expect(result[0].amount).toBe(0)
  })

  it('generates unique IDs across rows', () => {
    resetIds()
    const result = mapToReviewRows([mkTx(), mkTx(), mkTx()], ctx())
    const ids = result.map((r) => r.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('preserves the source Transaction in source.transaction', () => {
    const tx = mkTx({ merchant: 'PEEK' })
    const result = mapToReviewRows([tx], ctx())
    expect(result[0].source.transaction).toBe(tx)
  })

  it('leaves categoryId null for income rows', () => {
    const result = mapToReviewRows(
      [mkTx({ primaryAmount: { value: 100, currency: 'ARS', sign: 1 } })],
      ctx(),
    )
    expect(result[0].categoryId).toBeNull()
  })

  it('leaves categoryId null for expense rows — no pre-selection', () => {
    // Pre-selecting a default category led to silent miscategorization
    // (users accepted the first category without realizing). Force the
    // wizard to make the user pick.
    const result = mapToReviewRows([mkTx()], ctx())
    expect(result[0].kind).toBe('expense')
    expect(result[0].categoryId).toBeNull()
  })

  it('rounds USD conversion to 2 decimals', () => {
    const result = mapToReviewRows(
      [mkTx({ primaryAmount: { value: 16.789, currency: 'USDc', sign: -1 } })],
      { ...ctx(), usdToArsRate: 1234.5 },
    )
    // 16.789 × 1234.5 = 20726.0205 → round to 20726.02
    expect(result[0].amount).toBe(20726.02)
  })
})
