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
import { isEmailNotConfirmedError } from '@/features/auth/email-confirmation-error'
import {
  hideAuthTransitionSplash,
  markAuthSuccess,
  showAuthTransitionSplash,
} from '@/lib/auth-transition-splash'
import { authFlowLog, resetAuthFlowTimer } from '@/lib/auth-flow-logger'

/**
 * Sprint H · H2 — generic auth-failure copy.
 *
 * Antes el screen mostraba "Email not confirmed" (vía getErrorMessage) y
 * solo entonces renderizaba el resend-banner. Eso permitía enumeración
 * pasiva: un atacante que tipeara un email + cualquier password obtenía
 * confirmación de si la cuenta existía pero no estaba verificada.
 *
 * Ahora colapsamos todos los signin-errors a un mensaje genérico
 * indistinguible (wrong password, email no existe, email no confirmado,
 * todos lucen igual). La acción de "no me llegó el confirm email" pasa a
 * ser un link separado fuera del error-flow que el usuario clickea
 * proactivamente, lo que elimina el oráculo pasivo.
 */
const GENERIC_SIGNIN_ERROR = 'Email o contraseña incorrectos.'

/**
 * Trata como "wrong-credentials" cualquier signal de Supabase que pueda
 * filtrar info al atacante: Invalid login credentials, Email not
 * confirmed, user not found, etc. Errores de infra (network, captcha
 * rejected, rate limit) NO se colapsan — esos no enumeran cuentas y
 * benefician al usuario con copy específico.
 */
function isUserFacingCredentialError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { message?: unknown; code?: unknown; status?: unknown }
  if (isEmailNotConfirmedError(error)) return true
  if (typeof e.code === 'string') {
    if (e.code === 'invalid_credentials') return true
    if (e.code === 'user_not_found') return true
  }
  if (typeof e.message === 'string') {
    const m = e.message.toLowerCase()
    if (m.includes('invalid login credentials')) return true
    if (m.includes('invalid email or password')) return true
    if (m.includes('user not found')) return true
  }
  return false
}

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

    resetAuthFlowTimer()
    authFlowLog('login-submit', 'handleSubmit entry', { mode })

    // Show the splash IMMEDIATELY on submit (not after the network call).
    // Pre-fix: showAuthTransitionSplash() era llamado en handleSignedInTransition
    // que solo fire DESPUÉS de que passwordSignIn/passwordSignUp resolvieran
    // (~500-1500ms de network). Resultado: form locked durante el call, luego
    // BAM splash aparece de golpe. User feedback: "aparece de manera ABRUPTA".
    //
    // Ahora: splash fire INSTANT al submit → fade-in 150ms cubre el network
    // call → success path lo deja visible → error path lo esconde.
    showAuthTransitionSplash()

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
        authFlowLog('login-submit', 'calling passwordSignIn')
        await passwordSignIn({
          email: normalizedEmail,
          password: trimmedPassword,
          captchaToken,
        })
        authFlowLog('login-submit', 'passwordSignIn returned ok')
        // Reset splash timer post-auth para garantizar transición premium.
        markAuthSuccess()
      }

      await triggerHaptic('success')

      const resolution = resolveAuthSubmitResolution({
        hasSession: Boolean(signUpResponse?.session),
        mode,
      })

      if (resolution.type === 'email-confirmation') {
        // No vamos a navegar — hide splash para que el user vea el info.
        hideAuthTransitionSplash()
        onModeChange('sign-in')
        onPasswordReset()
        onInfoMessage(resolution.infoMessage)
        return
      }

      // Sprint R-1 (2026-06-10) — verified biometric re-enroll flow.
      //
      // After a successful manual sign-in we ALWAYS call
      // `persistBiometricCredentials(..., shouldPromptSetup: true)`. The
      // hook (`use-auth-biometric-controller.ts:62`) then:
      //   1. Re-reads the live biometric state.
      //   2. If the device has no biometric → no-op (silent return).
      //   3. If credentials are already saved → silently refresh the
      //      stored refresh token (auto-recovery from server-side
      //      rotation, no prompt).
      //   4. Otherwise → fire the "Activa Face ID para entrar más
      //      rápido la próxima vez." LocalAuthentication prompt and,
      //      on success, persist email + refresh token to Keychain.
      //
      // Verified call-sites that exercise this branch: this submit hook
      // (password sign-in) is the only producer of `shouldPromptSetup:
      // true`. There is no code path that skips it after a successful
      // sign-in — the call happens before the onboarding redirect and
      // before `onSignedIn()`, regardless of resolution type.
      //
      // Known UX caveat (R-3 will address): if the user DECLINES the
      // Face ID enrollment prompt here, no credentials are saved and
      // the next foreground will land on the bare welcome hero without
      // any lock layer. The R-3 "sticky biometric/PIN modal" closes
      // that hole by re-prompting until the user picks a lock method
      // (or explicitly opts out via Settings).
      await persistBiometricCredentials(normalizedEmail, {
        shouldPromptSetup: true,
      })

      if (resolution.type === 'onboarding') {
        onNavigateToJoin(resolution.href)
        return
      }

      authFlowLog('login-submit', 'calling onSignedIn')
      onSignedIn()
    } catch (error) {
      await triggerHaptic('error')
      // Hide splash on error: el form vuelve a quedar visible con el
      // error message. Si el call tuvo éxito, handleSignedInTransition
      // mantiene el splash visible hasta el home.
      hideAuthTransitionSplash()
      // H2: collapse credential-related errors to a generic message so
      // unconfirmed-account enumeration is impossible. Infra errors
      // (network, captcha, rate-limit) keep their specific copy because
      // they're useful to the user and don't leak account existence.
      if (mode === 'sign-in' && isUserFacingCredentialError(error)) {
        onErrorMessage(GENERIC_SIGNIN_ERROR)
      } else {
        onErrorMessage(getErrorMessage(error, 'No pudimos completar el acceso.'))
      }
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
