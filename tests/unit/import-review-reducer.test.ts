import { describe, expect, it } from 'vitest'
import type { ReviewRow, ReviewState } from '../../mobile/features/import-review/types'
import { reviewReducer } from '../../mobile/features/import-review/review-reducer'

const mkRow = (id: string, overrides: Partial<ReviewRow> = {}): ReviewRow => ({
  id,
  kind: 'expense',
  amount: 100,
  description: 'Test',
  date: '2026-06-01',
  notes: null,
  categoryId: 'cat-1',
  incomeKind: 'other',
  warnings: [],
  source: {
    origin: 'ocr',
    transaction: {
      merchant: 'Test',
      date: '2026-06-01',
      section: null,
      primaryAmount: { value: 100, currency: 'ARS', sign: -1 },
      secondaryAmount: null,
      raw: 'Test',
    },
    originalCurrency: 'ARS',
    appliedRate: null,
  },
  ...overrides,
})

const baseState: ReviewState = {
  rows: [mkRow('a'), mkRow('b'), mkRow('c')],
  unmatched: 0,
  imageUri: 'file:///fake.jpg',
}

describe('reviewReducer', () => {
  it('SET_KIND changes a row\'s kind without touching others', () => {
    const next = reviewReducer(baseState, {
      type: 'SET_KIND',
      id: 'b',
      kind: 'income',
    })
    expect(next.rows[0].kind).toBe('expense')
    expect(next.rows[1].kind).toBe('income')
    expect(next.rows[2].kind).toBe('expense')
  })

  it('PATCH_ROW merges partial fields on the target row', () => {
    const next = reviewReducer(baseState, {
      type: 'PATCH_ROW',
      id: 'a',
      patch: { amount: 500, description: 'Updated' },
    })
    expect(next.rows[0].amount).toBe(500)
    expect(next.rows[0].description).toBe('Updated')
    expect(next.rows[0].id).toBe('a')
    expect(next.rows[1]).toBe(baseState.rows[1])
  })

  it('SKIP_ROW sets kind to skip', () => {
    const next = reviewReducer(baseState, { type: 'SKIP_ROW', id: 'a' })
    expect(next.rows[0].kind).toBe('skip')
  })

  it('UNSKIP_ROW restores kind from sign (expense default)', () => {
    const skipped: ReviewState = {
      ...baseState,
      rows: [mkRow('a', { kind: 'skip' })],
    }
    const next = reviewReducer(skipped, { type: 'UNSKIP_ROW', id: 'a' })
    // Should restore to 'expense' (sign=-1 in our fixture)
    expect(next.rows[0].kind).toBe('expense')
  })

  it('UNSKIP_ROW restores to income when source sign is +1', () => {
    const skipped: ReviewState = {
      ...baseState,
      rows: [
        mkRow('a', {
          kind: 'skip',
          source: {
            origin: 'ocr',
            transaction: {
              merchant: 'Cashback',
              date: '2026-06-01',
              section: null,
              primaryAmount: { value: 100, currency: 'ARS', sign: 1 },
              secondaryAmount: null,
              raw: 'Cashback',
            },
            originalCurrency: 'ARS',
            appliedRate: null,
          },
        }),
      ],
    }
    const next = reviewReducer(skipped, { type: 'UNSKIP_ROW', id: 'a' })
    expect(next.rows[0].kind).toBe('income')
  })

  it('REMOVE_ROW deletes a row by id', () => {
    const next = reviewReducer(baseState, { type: 'REMOVE_ROW', id: 'b' })
    expect(next.rows.map((r) => r.id)).toEqual(['a', 'c'])
  })

  it('REPLACE returns the given state', () => {
    const newState: ReviewState = {
      rows: [mkRow('x')],
      unmatched: 5,
      imageUri: 'file:///other.jpg',
    }
    const next = reviewReducer(baseState, {
      type: 'REPLACE',
      state: newState,
    })
    expect(next).toEqual(newState)
  })

  it('unknown action returns the same state reference', () => {
    // @ts-expect-error testing exhaustive default branch
    const next = reviewReducer(baseState, { type: 'UNKNOWN' })
    expect(next).toBe(baseState)
  })

  it('SET_KIND on a non-existent id returns the same state reference', () => {
    const next = reviewReducer(baseState, {
      type: 'SET_KIND',
      id: 'nonexistent',
      kind: 'income',
    })
    expect(next).toBe(baseState)
  })
})
