// Google sign-in fue RE-HABILITADO (2026-06-21, commit 196a591) vía el
// flujo OAuth web de Supabase (`signInWithOAuth` + PKCE), que NO es
// replay-vulnerable como el viejo id_token sin nonce. Este test reemplaza
// al kill-switch viejo ("google-disabled"): verifica que está habilitado
// y que `signInWithGoogle` maneja el flujo OAuth (ya no corta a
// "deshabilitado"). Ver project_social_signin_behavior.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      // Devolvemos sin `url` a propósito → el flujo termina en
      // 'unavailable' (flow-failed) ANTES de abrir el WebBrowser, lo que
      // nos deja testear el path habilitado de forma determinística.
      signInWithOAuth: vi.fn(async () => ({ data: { url: null }, error: null })),
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

import { supabase } from '@/lib/supabase'
import {
  isGoogleSignInConfigured,
  signInWithGoogle,
} from '@/features/auth/social-sign-in'

describe('social-sign-in — Google habilitado (OAuth web flow + PKCE)', () => {
  it('isGoogleSignInConfigured devuelve true (kill-switch levantado)', () => {
    expect(isGoogleSignInConfigured()).toBe(true)
  })

  it('signInWithGoogle maneja el flujo OAuth (ya no corta a "deshabilitado")', async () => {
    const result = await signInWithGoogle()
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalled()
    // sin url → flow-failed, NO el corte de kill-switch
    expect(result.status).toBe('unavailable')
    expect(result.error ?? '').not.toMatch(/deshabilitado/i)
  })
})
