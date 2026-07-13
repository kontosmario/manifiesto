import { describe, expect, it } from 'vitest'
import type { PostgrestError } from '@supabase/supabase-js'
import {
  FixedExpenseNameTakenError,
  isDuplicateNameError,
  throwMigrationError,
} from '@/features/fixed-expenses/fixed-expense-repository.model'

function pgError(over: Partial<PostgrestError>): PostgrestError {
  return {
    name: 'PostgrestError',
    message: '',
    details: '',
    hint: '',
    code: '',
    ...over,
  } as PostgrestError
}

describe('isDuplicateNameError', () => {
  it('detecta el 23505 (unique violation)', () => {
    expect(isDuplicateNameError(pgError({ code: '23505' }))).toBe(true)
  })
  it('ignora otros codigos', () => {
    expect(isDuplicateNameError(pgError({ code: '42P01' }))).toBe(false)
    expect(isDuplicateNameError(pgError({ code: '' }))).toBe(false)
  })
})

describe('throwMigrationError', () => {
  it('mapea 23505 a un FixedExpenseNameTakenError tipado (para UI sin retry)', () => {
    const err = pgError({
      code: '23505',
      message:
        'duplicate key value violates unique constraint "fixed_expenses_family_id_name_key"',
    })
    expect(() => throwMigrationError(err)).toThrow(FixedExpenseNameTakenError)
  })

  it('un error generico NO es FixedExpenseNameTakenError', () => {
    let caught: unknown
    try {
      throwMigrationError(pgError({ code: '23502', message: 'not null violation' }))
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect(caught).not.toBeInstanceOf(FixedExpenseNameTakenError)
  })
})
