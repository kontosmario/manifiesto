import { useCallback, useState } from 'react'
import type { MutableRefObject } from 'react'
import { buildInitialBiometricState } from '@/features/auth/auth-biometric-state'
import { useAuthBiometricAutoSignIn } from '@/features/auth/use-auth-biometric-auto-sign-in'
import type { AuthMode } from '@/features/auth/auth-flow'
import {
  authenticateBiometricAccess,
  clearBiometricCredentials,
  getBiometricCredentials,
  getBiometricLoginState,
  saveBiometricCredentials,
  updateStoredRefreshToken,
  type BiometricLoginState,
} from '@/lib/biometric-auth'
import {
  hideAuthTransitionSplash,
  showAuthTransitionSplash,
} from '@/lib/auth-transition-splash'
import { triggerHaptic } from '@/lib/haptics'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/utils/error-message'

interface UseAuthBiometricControllerParams {
  clearFeedback: () => void
  isSubmitting: boolean
  mode: AuthMode
  onErrorMessage: (message: string) => void
  onInfoMessage: (message: string) => void
  onSignedIn: () => void
  submissionLockRef: MutableRefObject<boolean>
}

export function useAuthBiometricController({
  clearFeedback,
  isSubmitting,
  mode,
  onErrorMessage,
  onInfoMessage,
  onSignedIn,
  submissionLockRef,
}: UseAuthBiometricControllerParams) {
  const [isBiometricSubmitting, setBiometricSubmitting] = useState(false)
  const [biometricState, setBiometricState] = useState<BiometricLoginState>(buildInitialBiometricState)
  const isBusy = isSubmitting || isBiometricSubmitting

  const refreshBiometricState = useCallback(async () => {
    const nextState = await getBiometricLoginState()
    setBiometricState(nextState)
  }, [])

  /**
   * Persist the current Supabase refresh token in Keychain so a
   * subsequent biometric prompt can mint a new session without ever
   * touching the user's password again.
   *
   * Called after a successful manual sign-in. The refresh token is
   * read from the live session via `supabase.auth.getSession()`; we
   * do NOT take it as a parameter to avoid the password ever
   * appearing in this module's surface.
   */
  const persistBiometricCredentials = useCallback(
    async (
      nextEmail: string,
      options?: {
        shouldPromptSetup?: boolean
      },
    ) => {
      const nextBiometricState = await getBiometricLoginState()
      setBiometricState(nextBiometricState)

      if (!nextBiometricState.isAvailable) {
        return
      }

      let shouldSaveCredentials = nextBiometricState.hasSavedCredentials

      if (!shouldSaveCredentials && options?.shouldPromptSetup) {
        const biometricResult = await authenticateBiometricAccess({
          promptMessage: `Activa ${nextBiometricState.label} para entrar más rápido la próxima vez.`,
        })

        if (!biometricResult.success) {
          return
        }

        shouldSaveCredentials = true
      }

      if (!shouldSaveCredentials) {
        return
      }

      try {
        const sessionResponse = await supabase.auth.getSession()
        const refreshToken = sessionResponse.data.session?.refresh_token
        if (!refreshToken) {
          return
        }
        await saveBiometricCredentials({
          email: nextEmail,
          refreshToken,
        })
        setBiometricState({
          ...nextBiometricState,
          hasSavedCredentials: true,
        })
      } catch {
        return
      }
    },
    [],
  )

  const handleBiometricSignIn = useCallback(
    async (options?: { isAutomatic?: boolean }) => {
      if (submissionLockRef.current || isBiometricSubmitting) {
        return
      }

      clearFeedback()

      if (!biometricState.isAvailable) {
        onInfoMessage(`Este dispositivo no tiene ${biometricState.label} disponible para Manifiesto.`)
        void triggerHaptic('warning')
        return
      }

      if (!biometricState.hasSavedCredentials) {
        onInfoMessage(`Ingresa una vez con email y contraseña para activar ${biometricState.label}.`)
        void triggerHaptic('selection')
        return
      }

      submissionLockRef.current = true
      setBiometricSubmitting(true)

      try {
        const biometricResult = await authenticateBiometricAccess()

        if (!biometricResult.success) {
          if (
            !options?.isAutomatic &&
            biometricResult.error !== 'user_cancel' &&
            biometricResult.error !== 'system_cancel'
          ) {
            void triggerHaptic('warning')
          }
          return
        }

        // Optimistic feedback path: open the splash + haptic BEFORE
        // the network round trip so the user sees instant
        // acknowledgement of the biometric match.
        void triggerHaptic('success')
        showAuthTransitionSplash()

        const credentials = await getBiometricCredentials()

        if (!credentials) {
          // Stale or legacy (password-based) credentials — surface
          // the recovery prompt and clear so the user re-auths once
          // to re-arm biometric with a refresh token.
          hideAuthTransitionSplash()
          await clearBiometricCredentials()
          await refreshBiometricState()
          onInfoMessage(`Vuelve a ingresar manualmente para reactivar ${biometricState.label}.`)
          void triggerHaptic('warning')
          return
        }

        // Mint a fresh session from the stored refresh token.
        // Supabase rotates refresh tokens on each successful refresh;
        // capture the new one and update Keychain so the next
        // biometric attempt works.
        const refreshResponse = await supabase.auth.refreshSession({
          refresh_token: credentials.refreshToken,
        })

        if (refreshResponse.error || !refreshResponse.data.session) {
          throw refreshResponse.error ?? new Error('No se pudo restaurar la sesión.')
        }

        const newRefreshToken = refreshResponse.data.session.refresh_token
        if (newRefreshToken && newRefreshToken !== credentials.refreshToken) {
          await updateStoredRefreshToken(newRefreshToken)
        }

        onSignedIn()
      } catch (error) {
        // Network / Supabase failed — hide the splash so the
        // error UI on the auth screen is reachable.
        hideAuthTransitionSplash()
        await clearBiometricCredentials()
        await refreshBiometricState()
        void triggerHaptic('error')
        onErrorMessage(getErrorMessage(error, `No pudimos ingresar con ${biometricState.label}.`))
      } finally {
        submissionLockRef.current = false
        setBiometricSubmitting(false)
      }
    },
    [
      biometricState,
      clearFeedback,
      isBiometricSubmitting,
      onErrorMessage,
      onInfoMessage,
      onSignedIn,
      refreshBiometricState,
      submissionLockRef,
    ],
  )
  const { resetAutoBiometricAttempt } = useAuthBiometricAutoSignIn({
    enabled:
      mode === 'sign-in' &&
      !isBusy &&
      biometricState.isAvailable &&
      biometricState.hasSavedCredentials,
    onAttempt: async () => {
      await handleBiometricSignIn({ isAutomatic: true })
    },
  })

  return {
    biometricState,
    isBiometricSubmitting,
    actions: {
      handleBiometricSignIn,
      persistBiometricCredentials,
      refreshBiometricState,
      resetAutoBiometricAttempt,
    },
  }
}
