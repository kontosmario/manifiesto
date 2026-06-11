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
  markAuthSuccess,
  showAuthTransitionSplash,
} from '@/lib/auth-transition-splash'
import { authFlowLog } from '@/lib/auth-flow-logger'
import { biometricFeedbackForError } from '@/features/auth/biometric-feedback'
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

      authFlowLog('controller', 'handleBiometricSignIn entry', { isAutomatic: options?.isAutomatic ?? false })
      showAuthTransitionSplash()

      try {
        authFlowLog('controller', 'calling authenticateBiometricAccess')
        const biometricResult = await authenticateBiometricAccess()
        authFlowLog('controller', 'authenticateBiometricAccess returned', {
          success: biometricResult.success,
          ...(biometricResult.success ? {} : { error: biometricResult.error }),
        })

        if (!biometricResult.success) {
          // Cancel/fail → hide splash + surface error en login.
          hideAuthTransitionSplash()
          if (
            !options?.isAutomatic &&
            biometricResult.error !== 'user_cancel' &&
            biometricResult.error !== 'system_cancel'
          ) {
            void triggerHaptic('warning')
          }
          const feedback = biometricFeedbackForError(
            biometricResult.error,
            biometricState.label,
          )
          if (feedback) onErrorMessage(feedback.message)
          return
        }

        // FaceID success: reset el timer del splash. El FaceID pudo
        // tardar más que el minVisibleMs default → user no vería transición
        // premium. markAuthSuccess garantiza 1.2s de fern post-auth.
        markAuthSuccess()
        void triggerHaptic('success')

        authFlowLog('controller', 'calling getBiometricCredentials')
        const credentials = await getBiometricCredentials()
        authFlowLog('controller', 'getBiometricCredentials returned', { hasCredentials: Boolean(credentials) })

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
        authFlowLog('controller', 'calling refreshSession')
        const refreshResponse = await supabase.auth.refreshSession({
          refresh_token: credentials.refreshToken,
        })
        authFlowLog('controller', 'refreshSession returned', { hasError: Boolean(refreshResponse.error), hasSession: Boolean(refreshResponse.data.session) })

        if (refreshResponse.error || !refreshResponse.data.session) {
          throw refreshResponse.error ?? new Error('No se pudo restaurar la sesión.')
        }

        const newRefreshToken = refreshResponse.data.session.refresh_token
        if (newRefreshToken && newRefreshToken !== credentials.refreshToken) {
          await updateStoredRefreshToken(newRefreshToken)
        }

        authFlowLog('controller', 'calling onSignedIn')
        onSignedIn()
      } catch (error) {
        // Supabase couldn't refresh the session — most commonly because
        // the stored refresh token expired or got rotated server-side
        // (default Supabase refresh-token lifetime: 30 days). We
        // INTENTIONALLY do NOT clear the credentials here.
        //
        // Why we used to clear, and why that was wrong UX:
        //   Clearing wiped the email metadata too, so
        //   `hasSavedCredentials` flipped to false and the next cold
        //   start landed the user on the welcome hero instead of the
        //   personalized Face ID screen — even though their biometric
        //   enrolment was still valid and the only problem was a
        //   server-side token rotation. The user perceived this as
        //   "Face ID stopped working" with no recovery path.
        //
        // What we do instead:
        //   Keep the credentials blob + metadata in Keychain. The next
        //   cold start re-fires the auto-prompt as expected. After a
        //   successful manual password sign-in,
        //   `persistBiometricCredentials` overwrites the stored
        //   refresh token with the fresh one — so Face ID auto-recovers
        //   without the user having to re-enable anything in Settings.
        //
        // Explicit sign-out via the Settings → Cerrar sesión flow
        // still clears credentials (see `logout.ts`); this only
        // changes the implicit "session died on its own" path.
        hideAuthTransitionSplash()
        await refreshBiometricState()
        void triggerHaptic('error')
        onErrorMessage(
          getErrorMessage(
            error,
            `Tu sesión expiró. Ingresá con tu contraseña una vez para reactivar ${biometricState.label}.`,
          ),
        )
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
