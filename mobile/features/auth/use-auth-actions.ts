import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getEmailRedirectTo } from '@/features/auth/auth-flow'

interface SignInInput {
  email: string
  password: string
}

interface SignUpInput extends SignInInput {
  displayName: string
}

interface CallbackPayload {
  accessToken: string | null
  code: string | null
  refreshToken: string | null
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
    mutationFn: async ({ displayName, email, password }: SignUpInput) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getEmailRedirectTo(),
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

export function useCompleteAuthCallback() {
  return useMutation({
    mutationFn: async ({ accessToken, code, refreshToken }: CallbackPayload) => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (error) {
          throw error
        }

        return
      }

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (error) {
          throw error
        }
      }
    },
  })
}
