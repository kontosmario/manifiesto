import { describe, expect, it } from 'vitest'
import type { PostgrestError } from '@supabase/supabase-js'
import { isRlsViolationError } from '@/features/finance/family-finance.model'

function pgError(code: string): PostgrestError {
  return {
    name: 'PostgrestError',
    message: '',
    details: '',
    hint: '',
    code,
  } as PostgrestError
}

describe('isRlsViolationError', () => {
  it('detecta el 42501 (RLS insufficient_privilege)', () => {
    expect(isRlsViolationError(pgError('42501'))).toBe(true)
  })

  it('NO trata como RLS otros errores (missing table / column / red)', () => {
    expect(isRlsViolationError(pgError('42P01'))).toBe(false)
    expect(isRlsViolationError(pgError('42703'))).toBe(false)
    expect(isRlsViolationError(pgError(''))).toBe(false)
  })
})
