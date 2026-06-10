import { describe, expect, it, vi } from 'vitest'

// Sprint G · G-Auth3: pin-lock imports the Supabase client (for the
// server-side failure mirror). Stub it before the dynamic import so we
// don't try to load the real native bundle under vitest's Node env.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
  },
}))

import { _pbkdf2HmacSha256ForTesting } from '@/lib/pin-lock'

// RFC 6070 (PBKDF2-HMAC-SHA1) extended to SHA-256 by RFC 7914
// reference, and confirmed via Python:
//
//   import hashlib, binascii
//   binascii.hexlify(hashlib.pbkdf2_hmac('sha256', b'password', b'salt', 1, 32))
//   = '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b'
//
// These known-answer tests confirm the hand-rolled PBKDF2-HMAC-SHA256
// in pin-lock.ts matches the standard, not just itself. Without them,
// a sign-flipped XOR or wrong byte-order would pass the self-
// consistency tests (set/verify roundtrip) silently.

describe('PBKDF2-HMAC-SHA256 — RFC test vectors', () => {
  it('password="password", salt="salt", c=1, dkLen=32', () => {
    const salt = new TextEncoder().encode('salt')
    const dk = _pbkdf2HmacSha256ForTesting('password', salt, 1)
    const hex = Array.from(dk).map((b) => b.toString(16).padStart(2, '0')).join('')
    expect(hex).toBe('120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b')
  })

  it('password="password", salt="salt", c=2, dkLen=32', () => {
    const salt = new TextEncoder().encode('salt')
    const dk = _pbkdf2HmacSha256ForTesting('password', salt, 2)
    const hex = Array.from(dk).map((b) => b.toString(16).padStart(2, '0')).join('')
    expect(hex).toBe('ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43')
  })

  it('password="passwordPASSWORDpassword", salt="saltSALTsaltSALTsaltSALTsaltSALTsalt", c=4096, dkLen=32', () => {
    const salt = new TextEncoder().encode('saltSALTsaltSALTsaltSALTsaltSALTsalt')
    const dk = _pbkdf2HmacSha256ForTesting('passwordPASSWORDpassword', salt, 4096)
    const hex = Array.from(dk).map((b) => b.toString(16).padStart(2, '0')).join('')
    // NOTE: this vector is for dkLen=40 in RFC 7914; we truncate to 32 (our impl's single-block constraint).
    // Truncated to first 32 bytes:
    expect(hex).toBe('348c89dbcbd32b2f32d814b8116e84cf2b17347ebc1800181c4e2a1fb8dd53e1')
  })
})
