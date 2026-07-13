import { describe, expect, it } from 'vitest'
import type { PostgrestError } from '@supabase/supabase-js'
import {
  FixedExpenseNameTakenError,
  FixedExpenseNotPersistedError,
  isDuplicateNameError,
  isRetryFutileError,
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

const NAME_COLLISION = pgError({
  code: '23505',
  message:
    'duplicate key value violates unique constraint "fixed_expenses_family_id_name_key"',
})

// record_fixed_expense_payment raises a MANUAL 23505 for an already-recorded
// payment — same code, but NOT a name collision.
const PAYMENT_ALREADY_RECORDED = pgError({
  code: '23505',
  message: 'payment-already-recorded',
  details: 'duplicate_payment_for_period',
})

describe('isDuplicateNameError', () => {
  it('detecta el 23505 de la constraint UNIQUE(family_id, name)', () => {
    expect(isDuplicateNameError(NAME_COLLISION)).toBe(true)
  })

  it('NO clasifica como nombre-duplicado el 23505 de pago-ya-registrado', () => {
    // Regresión: throwMigrationError es compartido con record_fixed_expense_payment.
    expect(isDuplicateNameError(PAYMENT_ALREADY_RECORDED)).toBe(false)
  })

  it('ignora otros codigos', () => {
    expect(isDuplicateNameError(pgError({ code: '42P01' }))).toBe(false)
    expect(isDuplicateNameError(pgError({ code: '' }))).toBe(false)
  })
})

describe('throwMigrationError', () => {
  it('mapea el 23505 de nombre a FixedExpenseNameTakenError (UI sin retry)', () => {
    expect(() => throwMigrationError(NAME_COLLISION)).toThrow(
      FixedExpenseNameTakenError,
    )
  })

  it('NO mapea el 23505 de pago-ya-registrado a nombre-duplicado', () => {
    let caught: unknown
    try {
      throwMigrationError(PAYMENT_ALREADY_RECORDED)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect(caught).not.toBeInstanceOf(FixedExpenseNameTakenError)
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

describe('isRetryFutileError', () => {
  it('es true para los errores donde reintentar el mismo payload no sirve', () => {
    expect(isRetryFutileError(new FixedExpenseNameTakenError('x'))).toBe(true)
    expect(isRetryFutileError(new FixedExpenseNotPersistedError('x'))).toBe(true)
  })

  it('es false para un Error generico o un no-error (mantiene el retry)', () => {
    expect(isRetryFutileError(new Error('network'))).toBe(false)
    expect(isRetryFutileError('nope')).toBe(false)
    expect(isRetryFutileError(undefined)).toBe(false)
  })
})
