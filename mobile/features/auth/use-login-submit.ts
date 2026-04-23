import type { MutableRefObject } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useCallback } from 'react'
import {
  resolveAuthSubmitResolution,
} from '@/features/auth/auth-submit-flow'
import {
  validateAuthSubmission,
  type AuthMode,
} from '@/features/auth/auth-flow'
import { triggerHaptic } from '@/lib/haptics'
import { getErrorMessage } from '@/utils/error-message'

interface UseLoginSubmitInput {
  clearFeedback: () => void
  displayName: string
  email: string
  isBiometricSubmitting: boolean
  mode: AuthMode
  onErrorMessage: (message: string) => void
  onInfoMessage: (message: string) => void
  onModeChange: (mode: AuthMode) => void
  onNavigateToJoin: (href: '/(auth)/join') => void
  onSignedIn: () => void
  onPasswordReset: () => void
  password: string
  passwordSignIn: (input: {
    email: string
    password: string
  }) => Promise<unknown>
  passwordSignUp: (input: {
    displayName: string
    email: string
    password: string
  }) => Promise<{ session?: unknown | null }>
  persistBiometricCredentials: (
    email: string,
    password: string,
    options: { shouldPromptSetup: boolean },
  ) => Promise<void>
  setSubmitting: Dispatch<SetStateAction<boolean>>
  submissionLockRef: MutableRefObject<boolean>
}

export function useLoginSubmit({
  clearFeedback,
  displayName,
  email,
  isBiometricSubmitting,
  mode,
  onErrorMessage,
  onInfoMessage,
  onModeChange,
  onNavigateToJoin,
  onPasswordReset,
  onSignedIn,
  password,
  passwordSignIn,
  passwordSignUp,
  persistBiometricCredentials,
  setSubmitting,
  submissionLockRef,
}: UseLoginSubmitInput) {
  const handleSubmit = useCallback(async () => {
    if (submissionLockRef.current || isBiometricSubmitting) {
      return
    }

    clearFeedback()

    const validation = validateAuthSubmission({
      displayName,
      email,
      mode,
      password,
    })

    if ('error' in validation) {
      onErrorMessage(validation.error ?? 'No pudimos validar tus datos.')
      await triggerHaptic('warning')
      return
    }

    const { displayName: trimmedDisplayName, email: normalizedEmail, password: trimmedPassword } =
      validation.value

    submissionLockRef.current = true
    setSubmitting(true)

    try {
      const signUpResponse =
        mode === 'sign-in'
          ? null
          : await passwordSignUp({
              displayName: trimmedDisplayName,
              email: normalizedEmail,
              password: trimmedPassword,
            })

      if (mode === 'sign-in') {
        await passwordSignIn({
          email: normalizedEmail,
          password: trimmedPassword,
        })
      }

      await triggerHaptic('success')

      const resolution = resolveAuthSubmitResolution({
        hasSession: Boolean(signUpResponse?.session),
        mode,
      })

      if (resolution.type === 'email-confirmation') {
        onModeChange('sign-in')
        onPasswordReset()
        onInfoMessage(resolution.infoMessage)
        return
      }

      await persistBiometricCredentials(normalizedEmail, trimmedPassword, {
        shouldPromptSetup: true,
      })

      if (resolution.type === 'join') {
        onNavigateToJoin(resolution.href)
        return
      }

      onSignedIn()
    } catch (error) {
      await triggerHaptic('error')
      onErrorMessage(getErrorMessage(error, 'No pudimos completar el acceso.'))
    } finally {
      submissionLockRef.current = false
      setSubmitting(false)
    }
  }, [
    clearFeedback,
    displayName,
    email,
    isBiometricSubmitting,
    mode,
    onErrorMessage,
    onInfoMessage,
    onModeChange,
    onNavigateToJoin,
    onPasswordReset,
    onSignedIn,
    password,
    passwordSignIn,
    passwordSignUp,
    persistBiometricCredentials,
    setSubmitting,
    submissionLockRef,
  ])

  return {
    handleSubmit,
  }
}
