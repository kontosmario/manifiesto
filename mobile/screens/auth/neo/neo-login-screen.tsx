import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Platform, StyleSheet, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isAvatarSlug, type AvatarSlug } from '@/assets/avatars'
import { CaptchaModal } from '@/components/auth/captcha-modal'
import { WelcomeCancelDeletionBanner } from '@/components/common/welcome-cancel-deletion-banner'
import { RequireGuest } from '@/components/guards'
import { Auth4bLogin } from '@/components/redesign/auth/auth-4b-login'
import { AuthLoginVistas, type AuthLoginVista } from '@/components/redesign/auth/auth-login-vistas'
import { AuthLiveChrome, AuthScreenShell } from '@/components/redesign/auth/auth-kit'
import { resolveLoginActionView } from '@/features/auth/login-action-view'
import { useCaptcha } from '@/features/auth/use-captcha'
import { useLoginController } from '@/features/auth/use-login-controller'
import {
  isAppleSignInAvailable,
  isGoogleSignInConfigured,
  signInWithApple,
  signInWithGoogle,
} from '@/features/auth/social-sign-in'
import { offerBiometricEnrollmentAfterSocial } from '@/features/auth/offer-biometric-after-social'
import { useResendConfirmEmail } from '@/features/auth/use-resend-confirm-email'
import { dispatchAuthFlow } from '@/features/auth-flow/auth-flow-controller'
import { pickReturningGreeting } from '@/lib/copy/auth-greetings'
import { triggerHaptic } from '@/lib/haptics'
import { getLastUserProfile, type LastUserProfile } from '@/lib/last-user-cache'
import { useScreenCaptureProtection } from '@/lib/use-screen-capture-protection'
import { useThemeMode } from '@/theme/theme-provider'

type Status = 'idle' | 'scanning'
type FormMode = 'use-password' | 'change-account' | null

/**
 * Login LIVE del rediseño (Turno 4 · cableado 2026-07-17).
 *
 * Presenta las réplicas aprobadas (4b para el form completo,
 * AuthLoginVistas para returning / face-id / secondary-only) sobre la
 * MISMA orquestación que la pantalla anterior — misma máquina, mismos
 * hooks, mismos guards:
 *   · useLoginController: submit password (LOGIN_PENDING → LOGIN_SUCCESS
 *     vía use-login-submit, errores colapsados anti-enumeración),
 *     biometría (useAuthBiometricController) y captcha.
 *   · resolveLoginActionView: qué bloque se muestra (regla pura, la
 *     misma que la pantalla anterior — invariantes testeadas).
 *   · autoBiometric=1: auto-fire del prompt al llegar del arranque.
 *   · Sociales Apple/Google con gating real por plataforma/config.
 *   · Anti-enumeración del resend de confirmación (Sprint H · H2): el
 *     link lo abre el usuario; el server responde igual exista o no.
 *
 * DIFERENCIA deliberada con la pantalla anterior: los inputs viven
 * DENTRO de las réplicas (estado propio) y el submit entrega payload;
 * acá se sincroniza al controller y se dispara handleSubmit en el
 * commit siguiente (ref + effect sin deps) para que el closure del
 * submit vea los valores frescos.
 */
export function NeoLoginScreen() {
  // Sprint P · Audit #9 P-3: bloquear captura de pantalla sobre el form
  // de credenciales (mismo guard que la pantalla anterior).
  useScreenCaptureProtection()
  const { t } = useTranslation()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const mode = useThemeMode().resolvedMode

  // Captcha (Sprint F · F14): no-op sin site key; con key el resolver
  // abre CaptchaModal y devuelve el token del usuario.
  const captcha = useCaptcha()
  const resolveCaptchaToken = useCallback(async (): Promise<string | undefined> => {
    if (!captcha.isConfigured) return undefined
    const token = await captcha.request()
    return token ?? undefined
  }, [captcha])
  const controller = useLoginController({ resolveCaptchaToken })
  const { actions, biometricState, email, errorMessage, infoMessage, isBusy } = controller

  const hasSavedBiometric = biometricState.isAvailable && biometricState.hasSavedCredentials

  // Perfil cacheado del último usuario (SecureStore) para el hero
  // returning — nombre + avatar animal antes de cualquier red.
  const [lastUser, setLastUser] = useState<LastUserProfile | null>(null)
  const [lastUserLoaded, setLastUserLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    void getLastUserProfile().then((profile) => {
      if (cancelled) return
      setLastUser(profile)
      setLastUserLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])
  const lastUserAvatarSlug: AvatarSlug | null =
    lastUser?.avatarSlug && isAvatarSlug(lastUser.avatarSlug) ? lastUser.avatarSlug : null

  const isReturningUser = hasSavedBiometric || Boolean(lastUser)

  // Saludo del pool real, estable por mount (mismo criterio que la
  // pantalla anterior).
  const returningGreeting = useMemo(() => pickReturningGreeting(), [])

  const [formMode, setFormMode] = useState<FormMode>(null)
  const userPickedModeRef = useRef(false)
  // Qué campo autoenfocar cuando el usuario ELIGE un modo (review r1: la
  // pantalla vieja enfocaba tras "Usar contraseña"/"Cambiar cuenta" y en
  // el fallback de Face ID). null en la entrada auto-decidida: el
  // first-time ve el form sin teclado, como antes.
  const [focusField, setFocusField] = useState<'email' | 'password' | null>(null)

  // Auto-decidir el modo default cuando el cache asentó: returning ve
  // los botones (formMode=null); first-timer real va directo al form.
  useEffect(() => {
    if (userPickedModeRef.current) return
    if (!lastUserLoaded) return
    setFormMode(isReturningUser ? null : 'change-account')
  }, [lastUserLoaded, isReturningUser])

  // Estado del escaneo biométrico, sincronizado del busy del controller
  // (mismos functional updaters que la pantalla anterior — sin closures
  // stale).
  const [status, setStatus] = useState<Status>('idle')
  useEffect(() => {
    if (controller.isBusy) {
      setStatus((prev) => (prev === 'idle' ? 'scanning' : prev))
    } else {
      setStatus((prev) => (prev === 'scanning' ? 'idle' : prev))
    }
  }, [controller.isBusy])

  // Nombre del hero: display name cacheado > parte local del email >
  // fallback (mismo criterio que la pantalla anterior).
  const heroName = useMemo(() => {
    const cachedName = lastUser?.displayName?.trim()
    if (cachedName) return cachedName.split(' ')[0]
    const sourceEmail = email || lastUser?.email || ''
    const fromEmail = sourceEmail.includes('@') ? sourceEmail.split('@')[0] : ''
    if (!fromEmail) return t('auth:login.fallbackName')
    return fromEmail.charAt(0).toUpperCase() + fromEmail.slice(1)
  }, [email, lastUser, t])

  // ── Submit password: payload → controller → handleSubmit en el commit
  // siguiente (el closure de use-login-submit se rearma con los valores
  // nuevos recién en el próximo render). Guard por ref; el effect corre
  // en cada commit pero solo actúa con submit pendiente.
  const pendingSubmitRef = useRef(false)
  useEffect(() => {
    if (!pendingSubmitRef.current) return
    pendingSubmitRef.current = false
    void actions.handleSubmit()
  })
  const submitWith = useCallback(
    (nextEmail: string, nextPassword: string) => {
      if (isBusy) return
      actions.setEmail(nextEmail)
      actions.setPassword(nextPassword)
      pendingSubmitRef.current = true
    },
    [actions, isBusy],
  )

  // Háptico de error cuando aparece un error nuevo del server (el
  // contrato de las réplicas deja el háptico en manos del caller).
  const prevErrorRef = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevErrorRef.current
    prevErrorRef.current = errorMessage ?? null
    if (errorMessage && errorMessage !== prev) void triggerHaptic('error')
  }, [errorMessage])

  // ── Biometría (mismo flujo que la pantalla anterior) ────────────────
  const triggerBiometric = useCallback(async () => {
    if (status !== 'idle' || isBusy) return
    await triggerHaptic('selection')
    actions.clearFeedback()
    setStatus('scanning')
    try {
      await actions.handleBiometricSignIn()
      // Éxito navega (la máquina bridgea y esta pantalla se desmonta);
      // llegar acá = cancelado / fallo silencioso → idle para reintentar.
      setStatus('idle')
    } catch {
      setStatus('idle')
      userPickedModeRef.current = true
      setFocusField('password')
      setFormMode('use-password')
    }
  }, [actions, isBusy, status])

  // Auto-fire con ?autoBiometric=1 (una sola vez; limpia el param).
  const params = useLocalSearchParams<{ autoBiometric?: string }>()
  const autoBiometricFiredRef = useRef(false)
  useEffect(() => {
    if (autoBiometricFiredRef.current) return
    if (params.autoBiometric !== '1') return
    if (!hasSavedBiometric) return
    if (isBusy || status !== 'idle') return
    autoBiometricFiredRef.current = true
    router.setParams({ autoBiometric: undefined })
    void triggerBiometric()
  }, [params.autoBiometric, hasSavedBiometric, isBusy, status, router, triggerBiometric])

  // ── Sociales (gating + handlers idénticos a la pantalla anterior) ───
  // Init OPTIMISTA en iOS (review r1): evita el pop-in del botón Apple
  // (aparecía tras el probe async y empujaba el layout). El Alert de
  // handleAppleSignIn cubre la ventana si el probe resuelve false.
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
  const googleAvailable = isGoogleSignInConfigured()
  const [socialSigningIn, setSocialSigningIn] = useState(false)
  const [socialError, setSocialError] = useState<string | null>(null)

  const handleAppleSignIn = useCallback(async () => {
    if (socialSigningIn || isBusy) return
    if (!appleAvailable) {
      Alert.alert(
        t('auth:common.notAvailable'),
        Platform.OS === 'ios'
          ? t('auth:common.appleNotEnabledOnDevice')
          : t('auth:common.appleOnlyOnIos'),
      )
      return
    }
    setSocialSigningIn(true)
    setSocialError(null)
    try {
      const result = await signInWithApple()
      if (result.status === 'signed-in') {
        await triggerHaptic('success')
        await offerBiometricEnrollmentAfterSocial()
        dispatchAuthFlow({ type: 'LOGIN_SUCCESS' })
        return
      }
      if (result.status === 'cancelled') return
      await triggerHaptic('warning')
      setSocialError(result.error ?? t('auth:common.appleSignInFailed'))
    } finally {
      setSocialSigningIn(false)
    }
  }, [appleAvailable, isBusy, socialSigningIn, t])

  const handleGoogleSignIn = useCallback(async () => {
    if (socialSigningIn || isBusy) return
    if (!googleAvailable) {
      Alert.alert(t('auth:common.notAvailable'), t('auth:common.googleNotConfigured'))
      return
    }
    setSocialSigningIn(true)
    setSocialError(null)
    try {
      const result = await signInWithGoogle()
      if (result.status === 'signed-in') {
        await triggerHaptic('success')
        await offerBiometricEnrollmentAfterSocial()
        dispatchAuthFlow({ type: 'LOGIN_SUCCESS' })
        return
      }
      if (result.status === 'cancelled') return
      await triggerHaptic('warning')
      setSocialError(result.error ?? t('auth:common.googleSignInFailed'))
    } finally {
      setSocialSigningIn(false)
    }
  }, [googleAvailable, isBusy, socialSigningIn, t])

  // ── Resend de confirmación (anti-enumeración, Sprint H · H2) ────────
  //
  // Review r1: (a) 4b manda el email TIPEADO como payload — el estado del
  // controller solo se sincroniza en el submit, y caer al email cacheado
  // podía reenviar a OTRA cuenta; en las vistas returning (sin campo) sí
  // vale la cuenta del hero. (b) El resultado se decide con el retorno de
  // resend() — leer resendConfirm.error tras el await es un closure stale
  // que siempre reportaba éxito. (c) El cooldown ya no es silencioso.
  const resendConfirm = useResendConfirmEmail()
  const handleResendConfirm = useCallback(
    async (typedEmail?: string) => {
      const target = (typedEmail ?? (email || lastUser?.email || '')).trim()
      if (!target.includes('@')) {
        // Sin email a quién reenviar: pedirlo primero.
        actions.setInfoMessage(t('auth:signup.errorInvalidEmail'))
        return
      }
      if (resendConfirm.isPending) return
      if (resendConfirm.secondsUntilRetry > 0) {
        actions.setInfoMessage(
          t('auth:login.resendCooldown', { count: resendConfirm.secondsUntilRetry }),
        )
        return
      }
      const outcome = await resendConfirm.resend(target)
      if (outcome.ok) {
        void triggerHaptic('success')
        actions.setInfoMessage(t('auth:login.resendInfoSent'))
      } else {
        // El háptico de error lo dispara el effect de errorMessage.
        actions.setErrorMessage(outcome.error ?? t('auth:errors.resendFailed'))
      }
    },
    [actions, email, lastUser, resendConfirm, t],
  )

  // ── Navegación ──────────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    void triggerHaptic('light')
    if (router.canGoBack()) router.back()
    else router.replace('/(auth)/welcome')
  }, [router])

  const goForgot = useCallback(() => {
    router.push('/(auth)/forgot-password')
  }, [router])

  const handleUsePassword = useCallback(() => {
    userPickedModeRef.current = true
    // Igual que la pantalla anterior: pre-poblar el email cacheado — en
    // use-password el form es solo contraseña.
    if (!email && lastUser?.email) actions.setEmail(lastUser.email)
    setStatus('idle')
    setFocusField('password')
    setFormMode('use-password')
  }, [actions, email, lastUser])

  const handleChangeAccount = useCallback(() => {
    userPickedModeRef.current = true
    setStatus('idle')
    setFocusField('email')
    setFormMode('change-account')
    actions.setEmail('')
    actions.setPassword('')
  }, [actions])

  const handleCancelForm = useCallback(() => {
    actions.setPassword('')
    setFormMode(null)
  }, [actions])

  // ── Qué bloque se muestra (regla pura compartida) ───────────────────
  const actionView = resolveLoginActionView({
    formMode,
    isLockMode: false,
    hasSavedBiometric,
    isReturningUser,
  })

  const serverError = errorMessage ?? socialError ?? null
  const infoText = infoMessage ?? null
  // MISMA expresión que el submit del returning (review r1: display y
  // submit no pueden divergir — el hero mostraba el cacheado y el submit
  // salía con el email tipeado de un intento anterior).
  const heroEmail = email || lastUser?.email || t('auth:login.savedAccountFallback')
  const biometricLabel = biometricState.label || 'Face ID'

  const vistasView: AuthLoginVista | null =
    actionView === 'face-id'
      ? 'face-id'
      : actionView === 'secondary-only'
        ? 'secondary-only'
        : actionView === 'password-form' && formMode === 'use-password'
          ? 'returning'
          : null

  const body = (
    <AuthLiveChrome>
      <View style={styles.root}>
        {vistasView ? (
          <Animated.View
            key={vistasView}
            entering={FadeIn.duration(240)} // @motion-allow: 240ms = fade del stack de (auth) (AuthLayout animationDuration)
            style={styles.root}
          >
            <AuthLoginVistas
              mode={mode}
              view={vistasView}
              greeting={returningGreeting}
              name={heroName}
              email={heroEmail}
              avatar={lastUserAvatarSlug ?? undefined}
              biometricLabel={biometricLabel}
              scanning={status === 'scanning'}
              submitting={isBusy}
              serverError={serverError}
              infoText={infoText}
              appleAvailable={appleAvailable}
              googleAvailable={googleAvailable}
              autoFocusPassword={focusField === 'password'}
              onBack={handleBack}
              onContinue={({ password }) =>
                submitWith(email || lastUser?.email || '', password)
              }
              onBiometric={() => void triggerBiometric()}
              onForgot={goForgot}
              onResend={() => void handleResendConfirm()}
              onApple={() => void handleAppleSignIn()}
              onGoogle={() => void handleGoogleSignIn()}
              onUsePassword={handleUsePassword}
              onChangeAccount={handleChangeAccount}
              onChooseAnotherMethod={handleCancelForm}
            />
          </Animated.View>
        ) : actionView === 'password-form' ? (
          <Animated.View
            key="password-form"
            entering={FadeIn.duration(240)} // @motion-allow: 240ms = fade del stack de (auth) (AuthLayout animationDuration)
            style={styles.root}
          >
            <Auth4bLogin
              mode={mode}
              submitting={isBusy}
              serverError={serverError}
              infoText={infoText}
              appleAvailable={appleAvailable}
              googleAvailable={googleAvailable}
              autoFocusEmail={focusField === 'email'}
              onBack={isReturningUser ? handleCancelForm : handleBack}
              onContinue={({ email: nextEmail, password }) => submitWith(nextEmail, password)}
              onForgot={goForgot}
              onResend={({ email: typedEmail }) => void handleResendConfirm(typedEmail)}
              onApple={() => void handleAppleSignIn()}
              onGoogle={() => void handleGoogleSignIn()}
            />
          </Animated.View>
        ) : (
          // 'none': transitorio mientras asientan los caches async — el
          // shell solo evita el flash de un form que quizá no corresponda.
          <AuthScreenShell mode={mode} />
        )}

        {/* Baja de cuenta agendada (Sprint J · J-Auth2): banner funcional
            existente, superpuesto bajo la status bar. Devuelve null si no
            hay baja pendiente. */}
        <View
          pointerEvents="box-none"
          style={[styles.bannerOverlay, { top: insets.top + 8 }]}
        >
          <WelcomeCancelDeletionBanner loginHref="/(auth)/login" />
        </View>
      </View>

      <CaptchaModal visible={captcha.visible} onComplete={captcha.onComplete} />
    </AuthLiveChrome>
  )

  return <RequireGuest allowFamilylessSession>{body}</RequireGuest>
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bannerOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
})
