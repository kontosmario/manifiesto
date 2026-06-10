/**
 * Sprint H · H1 — validateAuthSubmission integration with password
 * policy. We test the boundary between sign-in / sign-up modes:
 *   · sign-up: full policy
 *   · sign-in: lax (non-empty + ≤72) so legacy passwords still work
 */
import { describe, expect, it } from 'vitest'
import { validateAuthSubmission } from '@/features/auth/auth-flow'

describe('validateAuthSubmission — Sprint H H1', () => {
  it('sign-up rejects short password', () => {
    const result = validateAuthSubmission({
      displayName: 'Test',
      email: 'test@example.com',
      mode: 'sign-up',
      password: 'short1',
    })
    expect('error' in result).toBe(true)
  })

  it('sign-up rejects all-numeric password', () => {
    const result = validateAuthSubmission({
      displayName: 'Test',
      email: 'test@example.com',
      mode: 'sign-up',
      password: '1234567890',
    })
    expect('error' in result).toBe(true)
  })

  it('sign-up rejects common-blocklist password', () => {
    const result = validateAuthSubmission({
      displayName: 'Test',
      email: 'test@example.com',
      mode: 'sign-up',
      password: 'Password123',
    })
    expect('error' in result).toBe(true)
  })

  it('sign-up accepts strong password', () => {
    const result = validateAuthSubmission({
      displayName: 'Test',
      email: 'test@example.com',
      mode: 'sign-up',
      password: 'Aurora!Sunset42',
    })
    expect('value' in result).toBe(true)
  })

  it('sign-in accepts a legacy short password (>=1 char, <=72)', () => {
    // Existing users may have signed up under the old 8-char min; we
    // can't break their ability to log in.
    const result = validateAuthSubmission({
      displayName: '',
      email: 'test@example.com',
      mode: 'sign-in',
      password: 'legacy7',
    })
    expect('value' in result).toBe(true)
  })

  it('sign-in rejects empty password', () => {
    const result = validateAuthSubmission({
      displayName: '',
      email: 'test@example.com',
      mode: 'sign-in',
      password: '',
    })
    expect('error' in result).toBe(true)
  })

  it('sign-in rejects passwords over 72 chars', () => {
    const result = validateAuthSubmission({
      displayName: '',
      email: 'test@example.com',
      mode: 'sign-in',
      password: 'A'.repeat(80),
    })
    expect('error' in result).toBe(true)
  })
})
