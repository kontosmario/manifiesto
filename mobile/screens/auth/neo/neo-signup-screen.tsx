import { useCallback, useEffect, useState } from 'react'
import { Alert, BackHandler, Linking, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { RequireGuest } from '@/components/guards'
import { CaptchaModal } from '@/components/auth/captcha-modal'
import { AuthLiveChrome } from '@/components/redesign/auth/auth-kit'
import { Auth4aCrearCuenta } from '@/components/redesign/auth/auth-4a-crear-cuenta'
import { AuthConfirmEmailPanel } from '@/components/redesign/auth/auth-confirm-email'
import { normalizeEmail } from '@/features/auth/auth-flow'
import { resolveAuthSubmitResolution } from '@/features/auth/auth-submit-flow'
import { checkPasswordPolicy } from '@/features/auth/password-policy'
import { offerBiometricEnrollmentAfterSocial } from '@/features/auth/offer-biometric-after-social'
import {
  isAppleSignInAvailable,
  isGoogleSignInConfigured,
  signInWithApple,
  signInWithGoogle,
  type SocialSignInResult,
} from '@/features/auth/social-sign-in'
import { usePasswordSignUp } from '@/features/auth/use-auth-actions'
import { useCaptcha } from '@/features/auth/use-captcha'
import { useResendConfirmEmail } from '@/features/auth/use-resend-confirm-email'
import { dispatchAuthFlow } from '@/features/auth-flow/auth-flow-controller'
import { triggerHaptic } from '@/lib/haptics'
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/lib/legal-urls'
import { useScreenCaptureProtection } from '@/lib/use-screen-capture-protection'
import { getErrorMessage } from '@/utils/error-message'
import { useThemeMode } from '@/theme/theme-provider'

/**
 * Crear cuenta LIVE del rediseño (Turno 4 · cableado 2026-07-17): monta
 * la réplica aprobada 4a con el chrome real (AuthLiveChrome) y ESPEJA la
 * lógica completa de screens/auth/signup-screen.tsx:
 *
 *  · usePasswordSignUp + gate de captcha (useCaptcha + CaptchaModal).
 *  · Validación con el MÓDULO real checkPasswordPolicy antes de disparar
 *    la mutation — incluye la blocklist de contraseñas comunes que la
 *    réplica no transcribe; el fallo sale como serverError (fila Brot
 *    worried + durazno), sin tocar el visual aprobado.
 *  · resolveAuthSubmitResolution: sesión inmediata → SIGNUP_SUCCESS (la
 *    máquina navega: bridge corto → biometric-setup — acá NO se navega a
 *    mano); sin sesión → panel de confirmación de email (la real NO
 *    despacha EMAIL_CONFIRMATION_PENDING en este camino, verificado).
 *  · Reenvío con useResendConfirmEmail (cooldown visible en el CTA del
 *    panel + rate limit local) + link anti-dead-end a login.
 *  · Sociales con los mismos handlers de la real (signInWithApple/
 *    signInWithGoogle + offerBiometricEnrollmentAfterSocial +
 *    SIGNUP_SUCCESS). Apple se OCULTA cuando no está disponible
 *    (prop appleAvailable de 4a) en vez del Alert de la real; el Alert
 *    queda como guard de la ventana optimista de iOS.
 *
 * Desvíos conscientes respecto de la pantalla vieja (documentados):
 *  · "Cambiar email" remonta el formulario VACÍO (la réplica es dueña
 *    del estado de sus campos; la real conservaba nombre+contraseña).
 *  · Los hápticos de press los pone el kit ('light'/'selection'); los de
 *    resultado (success/warning/error) los pone esta pantalla — no se
 *    duplican (contrato de AuthCta).
 */

/** Espejo de maskEmail de signup-screen.tsx (anti-shoulder-surfing). */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  if (local.length <= 2) return `${local[0]}***@${domain}`
  return `${local[0]}${local[1]}***@${domain}`
}

export function NeoSignupScreen() {
  // Espejo Sprint P · Audit #9 P-3: protección de captura en el form de
  // credenciales (hoy es no-op por decisión del owner; el seam queda).
  useScreenCaptureProtection()
  const { t } = useTranslation()
  const router = useRouter()
  const mode = useThemeMode().resolvedMode
  const passwordSignUp = usePasswordSignUp()
  const captcha = useCaptcha()
  const resendConfirm = useResendConfirmEmail()
  // Destructurada para que los useCallback dependan de la fn estable y
  // no del objeto del hook (cambia de identidad por render) — mismo
  // rationale que la real (CR Sprint A #5).
  const startResendCooldown = resendConfirm.startCooldown
  const resendCooldownSeconds = resendConfirm.secondsUntilRetry

  const [serverError, setServerError] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [isSubmitting, setSubmitting] = useState(false)
  // Flujo de confirmación por email: seteado cuando la resolución
  // post-signup decide "email-confirmation" (Supabase sin sesión).
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null)

  // Apple: gating por disponibilidad (ocultar, no Alert). Arranque
  // optimista en iOS para que el botón no haga pop-in cuando
  // isAppleSignInAvailable resuelve (el caso false en iOS es raro).
  const [appleAvailable, setAppleAvailable] = useState(Platform.OS === 'ios')
  useEffect(() => {
    let cancelled = false
    void isAppleSignInAvailable().then((value) => {
      if (!cancelled) setAppleAvailable(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleBack = useCallback(() => {
    // Háptico 'light' lo pone AuthBackHeader (kit).
    if (router.canGoBack()) router.back()
    else router.replace('/(auth)/welcome')
  }, [router])

  const openTerms = useCallback(() => {
    void Linking.openURL(TERMS_OF_SERVICE_URL)
  }, [])
  const openPrivacy = useCallback(() => {
    void Linking.openURL(PRIVACY_POLICY_URL)
  }, [])

  const handleCreate = useCallback(
    async ({ name, email, password }: { name: string; email: string; password: string }) => {
      if (isSubmitting) return
      const normalizedEmail = normalizeEmail(email)
      const trimmedName = name.trim()
      const trimmedPassword = password.trim()

      // Defensa en profundidad (espejo de submitSignup): la réplica 4a ya
      // bloquea el CTA con estas validaciones; si igual llega un payload
      // inválido, el error sale por la fila del rediseño.
      if (trimmedName.length < 2) {
        void triggerHaptic('error')
        setServerError(t('auth:signup.errorAddName'))
        return
      }
      if (!normalizedEmail.includes('@')) {
        void triggerHaptic('error')
        setServerError(t('auth:signup.errorInvalidEmail'))
        return
      }
      // Política REAL (incluye la blocklist de contraseñas comunes que la
      // réplica no transcribe): valida ANTES de disparar la mutation y el
      // fallo sale como serverError — el visual aprobado no cambia.
      const policy = checkPasswordPolicy(trimmedPassword)
      if (!policy.ok) {
        void triggerHaptic('error')
        setServerError(policy.error ?? t('auth:signup.errorPasswordPolicy'))
        return
      }

      setSubmitting(true)
      setServerError(null)
      setInfoMessage(null)
      try {
        // Captcha gate (sprint B · B3): si está configurado, widget y
        // token antes del signUp; sin key, request() resuelve null y va
        // undefined a Supabase (el server lo ignora si tampoco lo exige).
        let captchaToken: string | undefined
        if (captcha.isConfigured) {
          const token = await captcha.request()
          if (!token) {
            // Cancel / error / expired — no avanzamos.
            setSubmitting(false)
            await triggerHaptic('warning')
            setServerError(t('auth:signup.errorCaptcha'))
            return
          }
          captchaToken = token
        }

        const response = await passwordSignUp.mutateAsync({
          displayName: trimmedName,
          email: normalizedEmail,
          password: trimmedPassword,
          captchaToken,
        })

        await triggerHaptic('success')

        const resolution = resolveAuthSubmitResolution({
          hasSession: Boolean(response?.session),
          mode: 'sign-up',
        })

        if (resolution.type === 'email-confirmation') {
          setInfoMessage(resolution.infoMessage)
          setConfirmationEmail(normalizedEmail)
          // El email ya salió como parte del signUp; solo arrancamos el
          // cooldown visible para que "Reenviar" nazca deshabilitado 60s.
          startResendCooldown()
          return
        }

        // Signup fresco = evento de auth explícito: la máquina bridgea,
        // marca unlocked y navega (biometric-setup → onboarding). NO
        // navegamos a mano.
        dispatchAuthFlow({ type: 'SIGNUP_SUCCESS' })
      } catch (error) {
        await triggerHaptic('error')
        setServerError(getErrorMessage(error, t('auth:signup.errorCreateFailed')))
      } finally {
        setSubmitting(false)
      }
    },
    [captcha, isSubmitting, passwordSignUp, startResendCooldown, t],
  )

  // ─── Sociales (patrón exacto de signup-screen.tsx) ─────────────────

  const handleSocialResult = useCallback(
    async (label: string, runner: () => Promise<SocialSignInResult>) => {
      if (isSubmitting) return
      setSubmitting(true)
      setServerError(null)
      setInfoMessage(null)
      try {
        const result = await runner()
        if (result.status === 'signed-in') {
          await triggerHaptic('success')
          // Enrolamiento Face ID como el login con email: el gate por
          // created_at hace que las cuentas NUEVAS lo salteen (van a
          // biometric-setup) y solo las EXISTENTES reciban la oferta.
          await offerBiometricEnrollmentAfterSocial()
          // La máquina bridgea y resuelve destino (biometric-setup →
          // onboarding para cuentas nuevas; home si re-logueó una
          // existente ya onboardeada).
          dispatchAuthFlow({ type: 'SIGNUP_SUCCESS' })
          return
        }
        if (result.status === 'cancelled') {
          // Prompt nativo descartado — silencio, sin error UI.
          return
        }
        await triggerHaptic('warning')
        setServerError(result.error ?? t('auth:common.socialSignInFailed', { provider: label }))
      } finally {
        setSubmitting(false)
      }
    },
    [isSubmitting, t],
  )

  const handleAppleSignUp = useCallback(() => {
    if (!appleAvailable) {
      // Solo alcanzable en la ventana optimista de iOS (con
      // appleAvailable=false el botón está oculto) — espejo de la real.
      Alert.alert(
        t('auth:common.notAvailable'),
        Platform.OS === 'ios'
          ? t('auth:common.appleNotEnabledOnDevice')
          : t('auth:common.appleOnlyOnIos'),
      )
      return
    }
    void handleSocialResult('Apple', signInWithApple)
  }, [appleAvailable, handleSocialResult, t])

  const handleGoogleSignUp = useCallback(() => {
    if (!isGoogleSignInConfigured()) {
      Alert.alert(t('auth:common.notAvailable'), t('auth:common.googleNotConfigured'))
      return
    }
    void handleSocialResult('Google', signInWithGoogle)
  }, [handleSocialResult, t])

  // ─── Confirmación por email ────────────────────────────────────────

  const handleResendConfirmation = useCallback(async () => {
    if (!confirmationEmail) return
    if (resendCooldownSeconds > 0) return
    setServerError(null)
    // Decidir el feedback con el RETORNO de resend() (review r2): leer
    // resendConfirm.error tras el await es un closure stale que nunca ve
    // el fallo nuevo → el branch de error era código muerto (háptico de
    // éxito e infoMessage de éxito en un reenvío fallido).
    const outcome = await resendConfirm.resend(confirmationEmail)
    if (!outcome.ok) {
      await triggerHaptic('error')
      // outcome.error ya viene traducido del hook; fallback traducible.
      setServerError(outcome.error ?? t('auth:errors.resendFailed'))
      return
    }
    setInfoMessage(t('auth:signup.resentInfo'))
    await triggerHaptic('success')
  }, [confirmationEmail, resendCooldownSeconds, resendConfirm, t])

  const handleChangeEmail = useCallback(() => {
    // Vuelta al formulario. La réplica es dueña del estado de sus campos,
    // así que remonta VACÍA (la real conservaba nombre+contraseña).
    setConfirmationEmail(null)
    setInfoMessage(null)
    setServerError(null)
  }, [])

  // Android hardware back en el panel de confirmación (review r1): debe
  // espejar el back VISIBLE del panel (volver al formulario), no hacer
  // pop de la ruta entera a welcome dejando la confirmación pendiente
  // huérfana. Con confirmationEmail null el listener se libera y el back
  // de hardware vuelve a su semántica normal de ruta.
  useEffect(() => {
    if (!confirmationEmail || Platform.OS !== 'android') return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleChangeEmail()
      return true
    })
    return () => sub.remove()
  }, [confirmationEmail, handleChangeEmail])

  const handleGoToLogin = useCallback(() => {
    router.replace('/(auth)/login')
  }, [router])

  return (
    <RequireGuest allowFamilylessSession>
      <AuthLiveChrome>
        {confirmationEmail ? (
          <AuthConfirmEmailPanel
            mode={mode}
            email={maskEmail(confirmationEmail)}
            infoMessage={infoMessage}
            // Solo serverError (review r3): handleResendConfirmation ya
            // lo setea con el fallo del reenvío vía outcome, y
            // handleChangeEmail/handleCreate lo limpian. El
            // `?? resendConfirm.error` quedó redundante y podía mostrar un
            // error STALE (el hook solo limpia su error al PRÓXIMO resend,
            // no al remontar el panel con otro email).
            errorMessage={serverError}
            cooldownSeconds={resendCooldownSeconds}
            resending={resendConfirm.isPending}
            rateLimited={resendConfirm.rateLimited}
            onResend={() => void handleResendConfirmation()}
            onChangeEmail={handleChangeEmail}
            onLogin={handleGoToLogin}
          />
        ) : (
          <Auth4aCrearCuenta
            mode={mode}
            onBack={handleBack}
            onCreate={(payload) => void handleCreate(payload)}
            onApple={handleAppleSignUp}
            onGoogle={handleGoogleSignUp}
            onTerms={openTerms}
            onPrivacy={openPrivacy}
            submitting={isSubmitting}
            serverError={serverError}
            appleAvailable={appleAvailable}
            googleAvailable={isGoogleSignInConfigured()}
          />
        )}
        <CaptchaModal visible={captcha.visible} onComplete={captcha.onComplete} />
      </AuthLiveChrome>
    </RequireGuest>
  )
}
