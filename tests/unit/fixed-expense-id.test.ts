import { describe, expect, it } from 'vitest'
import {
  isPersistedFixedExpenseId,
  keepPersistedFixedExpenseIds,
} from '@/features/fixed-expenses/fixed-expense-id'

describe('fixed-expense-id', () => {
  it('acepta un uuid persistido real', () => {
    expect(
      isPersistedFixedExpenseId('061ecf9d-3385-4c77-8662-d25e0527b6c0'),
    ).toBe(true)
  })

  it('rechaza el id optimista temp-<ts>-<rand>', () => {
    // Formato exacto de makeTentativeId() en use-fixed-expenses.ts
    expect(isPersistedFixedExpenseId('temp-1783908129165-swsfiz')).toBe(false)
  })

  it('rechaza cualquier cosa que no tenga forma de uuid', () => {
    expect(isPersistedFixedExpenseId('')).toBe(false)
    expect(isPersistedFixedExpenseId('optimistic-123')).toBe(false)
    expect(isPersistedFixedExpenseId('not-a-uuid')).toBe(false)
    // uuid trunco / con basura alrededor
    expect(isPersistedFixedExpenseId('061ecf9d-3385-4c77-8662')).toBe(false)
    expect(
      isPersistedFixedExpenseId(' 061ecf9d-3385-4c77-8662-d25e0527b6c0 '),
    ).toBe(false)
  })

  it('acepta uuid en mayusculas (case-insensitive)', () => {
    expect(
      isPersistedFixedExpenseId('061ECF9D-3385-4C77-8662-D25E0527B6C0'),
    ).toBe(true)
  })

  it('filtra los temp-ids dejando solo los uuids persistidos, preservando orden', () => {
    const input = [
      '3a1c18e4-623e-4253-98da-4a5a903c5757',
      'temp-1783909654494-dnvdfn',
      '2d1fd035-8b7a-4964-8026-02ce94bc6ba6',
    ]
    expect(keepPersistedFixedExpenseIds(input)).toEqual([
      '3a1c18e4-623e-4253-98da-4a5a903c5757',
      '2d1fd035-8b7a-4964-8026-02ce94bc6ba6',
    ])
  })

  it('devuelve un array vacio cuando todos los ids son temporales', () => {
    expect(keepPersistedFixedExpenseIds(['temp-1-a', 'temp-2-b'])).toEqual([])
  })

  it('devuelve un array vacio para entrada vacia', () => {
    expect(keepPersistedFixedExpenseIds([])).toEqual([])
  })
})
