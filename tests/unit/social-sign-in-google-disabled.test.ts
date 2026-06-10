// Sprint J · Audit #3 J-Auth4 — Google sign-in is disabled at the
// module level because the free SDK can't inject a nonce. This test
// guards the kill-switch so a careless re-enable accidentally lights
// up replay-vulnerable signins again.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithIdToken: vi.fn(async () => ({ data: null, error: null })),
      updateUser: vi.fn(async () => ({ data: null, error: null })),
    },
  },
}))

vi.mock('expo-apple-authentication', () => ({
  isAvailableAsync: vi.fn(async () => true),
  signInAsync: vi.fn(),
  AppleAuthenticationScope: { FULL_NAME: 'FULL_NAME', EMAIL: 'EMAIL' },
}))

import {
  isGoogleSignInConfigured,
  signInWithGoogle,
} from '@/features/auth/social-sign-in'

describe('social-sign-in — Google disabled (J-Auth4)', () => {
  it('isGoogleSignInConfigured always returns false', () => {
    expect(isGoogleSignInConfigured()).toBe(false)
  })

  it('signInWithGoogle short-circuits to unavailable even if invoked', async () => {
    const result = await signInWithGoogle()
    expect(result.status).toBe('unavailable')
    expect(result.error).toMatch(/deshabilitado/i)
  })
})
