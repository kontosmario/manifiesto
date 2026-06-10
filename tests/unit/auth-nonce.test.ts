import { describe, expect, it } from 'vitest'
import { sha256 } from 'js-sha256'
import {
  createNoncePair,
  generateRawNonce,
  hashNonce,
} from '@/lib/auth-nonce'

// Node provides `crypto.getRandomValues` natively, so the CSPRNG path
// exercised here is the same path Hermes uses at runtime.

describe('auth-nonce', () => {
  it('generateRawNonce returns a 64-char lowercase hex string (32 bytes)', () => {
    const n = generateRawNonce()
    expect(n).toMatch(/^[0-9a-f]{64}$/)
  })

  it('generateRawNonce produces unique values across calls', () => {
    const a = generateRawNonce()
    const b = generateRawNonce()
    const c = generateRawNonce()
    expect(a).not.toBe(b)
    expect(b).not.toBe(c)
    expect(a).not.toBe(c)
  })

  it('hashNonce matches a standalone SHA-256 of the input', () => {
    const raw = generateRawNonce()
    const expected = sha256(raw)
    expect(hashNonce(raw)).toBe(expected)
    // Sanity: SHA-256 hex output is 64 chars.
    expect(hashNonce(raw)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('hashNonce is deterministic for the same input', () => {
    expect(hashNonce('abc')).toBe(hashNonce('abc'))
  })

  it('createNoncePair: hashedNonce equals sha256(rawNonce)', () => {
    const { rawNonce, hashedNonce } = createNoncePair()
    expect(hashedNonce).toBe(sha256(rawNonce))
  })

  it('hashedNonce is NOT equal to rawNonce (defense vs. accidentally sending raw)', () => {
    const { rawNonce, hashedNonce } = createNoncePair()
    expect(hashedNonce).not.toBe(rawNonce)
  })
})
