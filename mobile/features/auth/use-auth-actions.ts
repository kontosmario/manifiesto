import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  getEmailRedirectTo,
  getPasswordResetRedirectTo,
} from '@/features/auth/auth-flow'

interface SignInInput {
  email: string
  password: string
}

interface SignUpInput extends SignInInput {
  displayName: string
  /** hCaptcha token (sprint B · B3). `undefined` skipea — válido en dev
   *  cuando no hay site key configurada y mientras el captcha aún no
   *  esté habilitado en Supabase Dashboard. */
  captchaToken?: string
}

interface CallbackPayload {
  code: string | null
}

export function usePasswordSignIn() {
  return useMutation({
    mutationFn: async ({ email, password }: SignInInput) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
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
        throw new Error('Falta el código de confirmación. Volvé a intentar el acceso.')
      }
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        throw error
      }
    },
  })
}
