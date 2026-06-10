/**
 * Sprint H · H1 — password policy unit tests.
 *
 * The policy is pure (no IO, no env), so a node env test is enough.
 */
import { describe, expect, it } from 'vitest'
import {
  checkPasswordPolicy,
  PASSWORD_POLICY,
} from '@/features/auth/password-policy'

describe('checkPasswordPolicy', () => {
  it('rejects passwords shorter than the minimum', () => {
    const result = checkPasswordPolicy('Ab12!')
    expect(result.ok).toBe(false)
    expect(result.error).toContain(String(PASSWORD_POLICY.MIN_LENGTH))
  })

  it('rejects passwords longer than the bcrypt limit (72)', () => {
    const overLong = 'A1'.repeat(40) // 80 chars
    const result = checkPasswordPolicy(overLong)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('72')
  })

  it('rejects all-numeric passwords (even when length OK)', () => {
    const result = checkPasswordPolicy('1234567890123')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/letras y números/i)
  })

  it('rejects all-alpha passwords (even when length OK)', () => {
    const result = checkPasswordPolicy('abcdefghijklm')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/letras y números/i)
  })

  it('rejects common blocklist passwords case-insensitively', () => {
    const lower = checkPasswordPolicy('password123')
    expect(lower.ok).toBe(false)
    expect(lower.error).toMatch(/común/i)
    const mixed = checkPasswordPolicy('Password123')
    expect(mixed.ok).toBe(false)
  })

  it('accepts a strong mixed-class password', () => {
    const result = checkPasswordPolicy('Aurora!Sunset42')
    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('accepts a 10-char mixed password (boundary)', () => {
    const result = checkPasswordPolicy('Aurora1234')
    expect(result.ok).toBe(true)
  })

  it('accepts a 72-char mixed password (boundary)', () => {
    const password = 'A1'.repeat(36) // 72 chars
    const result = checkPasswordPolicy(password)
    expect(result.ok).toBe(true)
  })
})
