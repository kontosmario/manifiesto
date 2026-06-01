import { describe, expect, it, vi } from 'vitest'
import {
  isReopenInSession,
  newSessionId,
  REOPEN_THRESHOLD_MS,
} from '@/lib/telemetry-session'

describe('newSessionId', () => {
  it('returns a non-empty string', () => {
    expect(newSessionId()).toMatch(/.+/)
  })

  it('returns distinct ids on consecutive calls', () => {
    const a = newSessionId()
    const b = newSessionId()
    expect(a).not.toBe(b)
  })

  it('format is `<ts36>-<rand>`', () => {
    const id = newSessionId()
    expect(id).toMatch(/^[0-9a-z]+-[0-9a-z]+$/)
    const [ts, rand] = id.split('-')
    expect(ts).toBeTruthy()
    expect(rand?.length).toBeGreaterThan(0)
  })
})

describe('isReopenInSession', () => {
  it('returns false when there has been no previous unmount', () => {
    expect(isReopenInSession(null, 1_000_000)).toBe(false)
  })

  it('returns true when the gap is below the threshold', () => {
    const now = 1_000_000
    const lastUnmountedAt = now - (REOPEN_THRESHOLD_MS - 1)
    expect(isReopenInSession(lastUnmountedAt, now)).toBe(true)
  })

  it('returns false when the gap equals the threshold (strict <)', () => {
    const now = 1_000_000
    const lastUnmountedAt = now - REOPEN_THRESHOLD_MS
    expect(isReopenInSession(lastUnmountedAt, now)).toBe(false)
  })

  it('returns false when the gap exceeds the threshold', () => {
    const now = 1_000_000
    const lastUnmountedAt = now - (REOPEN_THRESHOLD_MS + 5_000)
    expect(isReopenInSession(lastUnmountedAt, now)).toBe(false)
  })
})

describe('REOPEN_THRESHOLD_MS', () => {
  it('is set to 60 seconds', () => {
    expect(REOPEN_THRESHOLD_MS).toBe(60_000)
  })
})

describe('newSessionId — collision sanity', () => {
  it('1000 ids in a tight loop have <1% collision rate', () => {
    // Math.random + Date.now should be more than enough for client-
    // side correlation. This is a sanity test, not a cryptographic
    // guarantee.
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) seen.add(newSessionId())
    expect(seen.size).toBeGreaterThanOrEqual(990)
  })

  it('sequential calls within the same millisecond still differ', () => {
    // Mock Date.now so the timestamp portion is identical.
    const originalNow = Date.now
    try {
      Date.now = () => 1_700_000_000_000
      const a = newSessionId()
      const b = newSessionId()
      expect(a).not.toBe(b)
    } finally {
      Date.now = originalNow
    }
  })
})

void vi // ensure the import is referenced even if no spies are needed
