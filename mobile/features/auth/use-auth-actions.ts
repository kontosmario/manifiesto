import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import i18n from '@/lib/i18n'
import {
  getEmailRedirectTo,
  getPasswordResetRedirectTo,
} from '@/features/auth/auth-flow'

interface SignInInput {
  email: string
  password: string
  /** hCaptcha token (sprint F · F14). Sign-in MUST forward the token
   *  when captcha is enabled in the Supabase Dashboard — otherwise
   *  every login returns `captcha_token_required`. If captcha is not
   *  enabled, the server ignores this field silently, so it's always
   *  safe to forward (including `undefined` in dev without a site key).
   *  Closes the credential-stuffing-without-captcha gap that sign-up
   *  and password-reset already cover. */
  captchaToken?: string
}

interface SignUpInput extends SignInInput {
  displayName: string
}

interface CallbackPayload {
  code: string | null
}

export function usePasswordSignIn() {
  return useMutation({
    mutationFn: async ({ email, password, captchaToken }: SignInInput) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: {
          // Sprint F · F14: forward captcha token. Supabase ignores the
          // field if captcha isn't enabled server-side; required when it
          // is. Matches the sign-up + password-reset call shape.
          captchaToken,
        },
      })

      if (error) {
        throw error
      }
    },
  })
}

export function usePasswordSignUp() {
  return useMutation({
    mutationFn: async ({
      displayName,
      email,
      password,
      captchaToken,
    }: SignUpInput) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getEmailRedirectTo(),
          // Supabase Auth pasa `captchaToken` a hCaptcha server-side
          // si captcha está habilitado en el Dashboard. Si está
          // habilitado y NO mandamos token, devuelve 400 con
          // `captcha_token_required`. Si NO está habilitado, ignora
          // el campo silently — seguro de mandar.
          captchaToken,
          data: {
            display_name: displayName,
          },
        },
      })

      if (error) {
        throw error
      }

      return data
    },
  })
}

export function usePasswordReset() {
  return useMutation({
    mutationFn: async ({
      email,
      captchaToken,
    }: {
      email: string
      captchaToken?: string
    }) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getPasswordResetRedirectTo(),
        captchaToken,
      })
      if (error) {
        throw error
      }
    },
  })
}

/**
 * Fallback del reset por código OTP (6 dígitos del mail), independiente del
 * deep-link/Universal Link. `verifyOtp({type:'recovery'})` deja una sesión de
 * recovery — exactamente igual que el `exchangeCodeForSession` del PKCE — así
 * que el resto del flujo seguro (re-auth gate + form) no cambia. Funciona en
 * Expo Go / dev build / TestFlight porque no depende de schemes ni AASA.
 */
export function useVerifyRecoveryOtp() {
  return useMutation({
    mutationFn: async ({ email, token }: { email: string; token: string }) => {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'recovery',
      })
      if (error) {
        throw error
      }
    },
  })
}

export function useUpdatePassword() {
  return useMutation({
    mutationFn: async ({ password }: { password: string }) => {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        throw error
      }
    },
  })
}

export function useCompleteAuthCallback() {
  return useMutation({
    mutationFn: async ({ code }: CallbackPayload) => {
      // PKCE-only flow. The previous implementation also accepted
      // `access_token` + `refresh_token` query params and called
      // `setSession`, which let a phishing deep link
      // (`manifiesto://auth/callback?access_token=<attacker-jwt>...`)
      // silently swap the user into an attacker-controlled session.
      // PKCE moves the secret material to a code-for-token exchange
      // bound to the device's verifier, closing that vector.
      if (!code) {
        throw new Error(i18n.t('auth:errors.missingConfirmationCode'))
      }
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        throw error
      }
    },
  })
}
