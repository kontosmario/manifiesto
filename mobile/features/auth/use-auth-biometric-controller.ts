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
  type BiometricLoginState,
} from '@/lib/biometric-auth'
import { triggerHaptic } from '@/lib/haptics'
import { getErrorMessage } from '@/utils/error-message'

interface UseAuthBiometricControllerParams {
  clearFeedback: () => void
  isSubmitting: boolean
  mode: AuthMode
  onErrorMessage: (message: string) => void
  onInfoMessage: (message: string) => void
  onSignedIn: () => void
  signInWithPassword: (credentials: { email: string; password: string }) => Promise<unknown>
  submissionLockRef: MutableRefObject<boolean>
}

export function useAuthBiometricController({
  clearFeedback,
  isSubmitting,
  mode,
  onErrorMessage,
  onInfoMessage,
  onSignedIn,
  signInWithPassword,
  submissionLockRef,
}: UseAuthBiometricControllerParams) {
  const [isBiometricSubmitting, setBiometricSubmitting] = useState(false)
  const [biometricState, setBiometricState] = useState<BiometricLoginState>(buildInitialBiometricState)
  const isBusy = isSubmitting || isBiometricSubmitting

  const refreshBiometricState = useCallback(async () => {
    const nextState = await getBiometricLoginState()
    setBiometricState(nextState)
  }, [])

  const persistBiometricCredentials = useCallback(
    async (
      nextEmail: string,
      nextPassword: string,
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
        // Single interaction: skip the app-level Alert ("Activar
        // Face ID? — Ahora no / Activar") and go straight to the
        // native LocalAuthentication prompt. Apple/Android already
        // own a perfectly clear "Cancel / scan" dialog; the
        // app-level pre-prompt was asking the same question twice.
        // The setup-specific `promptMessage` keeps the context
        // ("Activá X para entrar más rápido la próxima vez") so the
        // user understands this is opt-in setup, not a guard.
        const biometricResult = await authenticateBiometricAccess({
          promptMessage: `Activá ${nextBiometricState.label} para entrar más rápido la próxima vez.`,
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
        await saveBiometricCredentials({
          email: nextEmail,
          password: nextPassword,
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
        await triggerHaptic('warning')
        return
      }

      if (!biometricState.hasSavedCredentials) {
        onInfoMessage(`Ingresá una vez con email y contraseña para activar ${biometricState.label}.`)
        await triggerHaptic('selection')
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
            await triggerHaptic('warning')
          }
          return
        }

        const credentials = await getBiometricCredentials()

        if (!credentials) {
          await clearBiometricCredentials()
          await refreshBiometricState()
          onInfoMessage(`Volvé a ingresar manualmente para reactivar ${biometricState.label}.`)
          await triggerHaptic('warning')
          return
        }

        await signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        })

        await triggerHaptic('success')
        onSignedIn()
      } catch (error) {
        await clearBiometricCredentials()
        await refreshBiometricState()
        await triggerHaptic('error')
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
      signInWithPassword,
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
