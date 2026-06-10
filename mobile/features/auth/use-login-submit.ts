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
  onNavigateToJoin: (href: '/(app)/biometric-setup') => void
  onSignedIn: () => void
  onPasswordReset: () => void
  password: string
  passwordSignIn: (input: {
    email: string
    password: string
    captchaToken?: string
  }) => Promise<unknown>
  passwordSignUp: (input: {
    displayName: string
    email: string
    password: string
    captchaToken?: string
  }) => Promise<{ session?: unknown | null }>
  /**
   * Sprint F · F14: optional captcha resolver, called right before
   * `signInWithPassword`. When `useCaptcha().isConfigured` is true the
   * caller passes a fn that opens the hCaptcha widget and returns a
   * fresh token; otherwise `undefined` (forwarded to Supabase, ignored
   * server-side when captcha isn't on).
   */
  resolveCaptchaToken?: () => Promise<string | undefined>
  persistBiometricCredentials: (
    email: string,
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
  resolveCaptchaToken,
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
        // Sprint F · F14: resolve captcha BEFORE the mutation so a
        // cancel/error path doesn't leave the submit lock dangling
        // (the finally below clears it). When `resolveCaptchaToken`
        // is undefined or returns undefined we forward `undefined` —
        // Supabase ignores it when captcha is disabled server-side.
        const captchaToken = resolveCaptchaToken
          ? await resolveCaptchaToken()
          : undefined
        await passwordSignIn({
          email: normalizedEmail,
          password: trimmedPassword,
          captchaToken,
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

      await persistBiometricCredentials(normalizedEmail, {
        shouldPromptSetup: true,
      })

      if (resolution.type === 'onboarding') {
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
    resolveCaptchaToken,
    setSubmitting,
    submissionLockRef,
  ])

  return {
    handleSubmit,
  }
}
