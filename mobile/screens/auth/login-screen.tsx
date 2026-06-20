import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CaptchaModal } from '@/components/auth/captcha-modal'
import { useCaptcha } from '@/features/auth/use-captcha'
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import { useLocalSearchParams, useRouter } from 'expo-router'
import Svg, { Circle, Path } from 'react-native-svg'
import { RequireGuest } from '@/components/guards'
import { TextField } from '@/components/ui/text-field'
import { PasswordField } from '@/components/ui/password-field'
import { FeedbackPill } from '@/components/auth/auth-feedback-pill'
import { FernLogo } from '@/components/auth/fern-logo'
import { WelcomeCancelDeletionBanner } from '@/components/common/welcome-cancel-deletion-banner'
import { Screen } from '@/components/ui/screen'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { isAvatarSlug, type AvatarSlug } from '@/assets/avatars'
import { resolveLoginActionView } from '@/features/auth/login-action-view'
import { useLoginController } from '@/features/auth/use-login-controller'
import {
  isAppleSignInAvailable,
  signInWithApple,
} from '@/features/auth/social-sign-in'
import { useResendConfirmEmail } from '@/features/auth/use-resend-confirm-email'
import { dispatchAuthFlow } from '@/features/auth-flow/auth-flow-controller'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { pickReturningGreeting } from '@/lib/copy/auth-greetings'
import { triggerHaptic } from '@/lib/haptics'
import { useScreenCaptureProtection } from '@/lib/use-screen-capture-protection'
import { decorativeDurations, motionDurations, motionEasings } from '@/lib/motion/tokens'
import { getLastUserProfile, type LastUserProfile } from '@/lib/last-user-cache'
import { authTokens } from '@/theme/palette'
import type { ThemeColors } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { DEFAULT_HIT_SLOP } from '@/theme/interaction'

// Brand-fixed tokens — these stay constant across themes because they
// belong to the Manifiesto identity (CTA green, peach accent, focus
// ring, brand cream). Surface and text colors come from the theme.
const DARK_GREEN = authTokens.welcomeBg
const CREAM = authTokens.surfaceCream
const PEACH = authTokens.peach
const CLAY = authTokens.clay

type Status = 'idle' | 'scanning'
type FormMode = 'use-password' | 'change-account' | null

/**
 * Login screen — Face ID-first.
 *
 * v1 simplification (per spec): when biometric credentials are saved we show
 * the Face ID hero. We use the email stored alongside biometric credentials
 * to derive a display name (the part before "@", capitalized). When no
 * stored credentials exist we render the password form by default.
 *
 * The actual Face ID handshake is delegated to `useLoginController` →
 * `actions.handleBiometricSignIn`, which prompts Local Authentication and
 * signs in via the saved password. UI state (`scanning`) is local
 * and synced from controller flags.
 */
export function LoginScreen() {
  // Sprint P · Audit #9 P-3 (2026-06-10): block screen capture on the
  // credential form (email + password). Prevents replay of typed creds
  // from a screen recording captured by malware in side-loaded context.
  useScreenCaptureProtection()
  const router = useRouter()
  const reducedMotion = useReducedMotion()
  // Sprint F · F14: captcha for password sign-in. The hook is a no-op
  // when EXPO_PUBLIC_HCAPTCHA_SITE_KEY isn't configured (request()
  // resolves null → we forward undefined to Supabase, which ignores
  // it when captcha isn't enabled server-side). When configured, the
  // resolver opens CaptchaModal and returns the user's token. Same
  // pattern as signup-screen.
  const captcha = useCaptcha()
  const resolveCaptchaToken = useCallback(async (): Promise<string | undefined> => {
    if (!captcha.isConfigured) return undefined
    const token = await captcha.request()
    return token ?? undefined
  }, [captcha])
  const controller = useLoginController({ resolveCaptchaToken })
  const { theme } = useAppTheme()
  // Cold-start biometric auto-fire. AppEntryGate redirects returning
  // users with saved biometrics to `/(auth)/login?autoBiometric=1`,
  // expecting the prompt to fire on its own — the user shouldn't have
  // to tap anything. We read the param once, fire the prompt, then
  // clear it so a back-navigate or remount can't re-trigger.
  const params = useLocalSearchParams<{ autoBiometric?: string; lock?: string }>()
  const autoBiometricFiredRef = useRef(false)
  // Refactor (2026-06-11): el ex-lock-mode (`?lock=1`) se movió a
  // /(auth)/unlock. Login solo maneja sign-in normal ahora — `params.lock`
  // queda probado por defensa pero no se usa en lógica activa.

  const {
    actions,
    biometricState,
    email,
    errorMessage,
    infoMessage,
    isBusy,
    isReducedMotionEnabled,
    password,
    passwordInputRef,
    emailInputRef,
  } = controller

  const hasSavedBiometric =
    biometricState.isAvailable && biometricState.hasSavedCredentials

  // Last-known user profile read from SecureStore. Lets us show the
  // user's actual name + animal avatar on the returning hero before any
  // network call. `null` while loading or when there's no prior session.
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
    lastUser?.avatarSlug && isAvatarSlug(lastUser.avatarSlug)
      ? lastUser.avatarSlug
      : null

  // "Returning" = either biometric is set up OR we have a cached
  // profile from a prior successful login on this install.
  const isReturningUser = hasSavedBiometric || Boolean(lastUser)

  // Pick one of the 50 unisex returning-greetings once per mount so
  // the eyebrow stays stable while the user types but feels fresh
  // across app opens. The previous fixed copy ("Bienvenida de
  // vuelta") was strictly feminine — these are gender-neutral.
  const returningGreeting = useMemo(() => pickReturningGreeting(), [])

  // Ref to the Screen's underlying ScrollView so we can scrollToEnd
  // when the keyboard opens during password entry. The system's
  // automatic keyboard insets only ensure the focused input is
  // visible — but we want the "Continuar" + "Volver a otro método"
  // CTAs (which sit BELOW the input) to also clear the keyboard.
  // scrollToEnd handles that in one shot.
  const scrollRef = useRef<ScrollView | null>(null)

  // Auto-decide the default form mode once the lastUser cache has
  // settled. Returning users see the buttons (formMode=null); true
  // first-timers (no biometric, no cache) get the change-account form
  // active so they can sign in immediately. We re-evaluate if
  // hasSavedBiometric flips later (async biometric refresh) — unless
  // the user has already manually picked a mode.
  useEffect(() => {
    if (userPickedModeRef.current) return
    if (!lastUserLoaded) return
    setFormMode(isReturningUser ? null : 'change-account')
  }, [lastUserLoaded, isReturningUser])

  // Form starts hidden. We can't decide the default state synchronously
  // because `biometricState` initializes as
  // `{isAvailable: false, hasSavedCredentials: false}` and the real
  // values are loaded async via `refreshBiometricState`. The `lastUser`
  // cache is also loaded async. Auto-opening based on the synchronous
  // initial values would briefly flash the form for returning users
  // who actually have saved data.
  const [formMode, setFormMode] = useState<FormMode>(null)
  // Once the user explicitly picks a mode (via the secondary buttons or
  // a Face ID failure), don't let the auto-decide effect override them.
  const userPickedModeRef = useRef(false)

  // When the keyboard opens during password entry, scroll the
  // ScrollView all the way to the end so the "Continuar" CTA and
  // the "Volver a otro método" link sit comfortably above the
  // keyboard. The system's automatic keyboard insets only push
  // enough to show the focused input — but the user wants context
  // (the buttons below) visible too.
  useEffect(() => {
    if (!formMode) return
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      // requestAnimationFrame ensures the auto-insets layout pass
      // has settled before we issue our manual scroll.
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: true })
      })
    })
    return () => sub.remove()
  }, [formMode])

  // Local UI status reflects the biometric submission.
  const [status, setStatus] = useState<Status>('idle')

  // Sync local `status` to the controller's busy flag. Uses functional
  // updaters for BOTH branches so we never read `status` from a stale
  // closure (the previous version did, behind an eslint-disable, which
  // made the scanning→idle reset race-prone after a cancel and could
  // leave the CTA stuck disabled).
  useEffect(() => {
    if (controller.isBusy) {
      setStatus((prev) => (prev === 'idle' ? 'scanning' : prev))
    } else {
      // controller stopped — assume the prompt closed; drop back to idle
      // if we were mid-scan so the CTA re-enables for a retry.
      setStatus((prev) => (prev === 'scanning' ? 'idle' : prev))
    }
  }, [controller.isBusy])

  // Greeting prefers the cached display name (set after every successful
  // session) over an email-derived fallback. Falls back to "amigo" only
  // when we have no cached profile and no email at all.
  const greeting = useMemo(() => {
    const cachedName = lastUser?.displayName?.trim()
    if (cachedName) return cachedName.split(' ')[0]
    const sourceEmail = email || lastUser?.email || ''
    const fromEmail = sourceEmail.includes('@') ? sourceEmail.split('@')[0] : ''
    if (!fromEmail) return 'amigo'
    return fromEmail.charAt(0).toUpperCase() + fromEmail.slice(1)
  }, [email, lastUser])

  // Animations
  const reduced = reducedMotion || isReducedMotionEnabled
  const ringScale = useSharedValue(1)
  const ringOpacity = useSharedValue(0)
  const haloScale = useSharedValue(1)

  useEffect(() => {
    if (reduced) {
      ringScale.value = 1
      ringOpacity.value = status === 'scanning' ? 0.7 : 0
      haloScale.value = 1
      return
    }
    if (status === 'scanning') {
      ringOpacity.value = withTiming(1, { duration: motionDurations.exitStack })
      ringScale.value = withRepeat(
        withSequence(
          // @motion-allow: 700ms scan-pulse half-cycle; sits between paintExit (600) and skeleton-style 820 for biometric scan rhythm
          withTiming(1.08, { duration: 700, easing: motionEasings.warm }),
          // @motion-allow: 700ms scan-pulse half-cycle; sits between paintExit (600) and skeleton-style 820 for biometric scan rhythm
          withTiming(1, { duration: 700, easing: motionEasings.warm }),
        ),
        -1,
        false,
      )
      haloScale.value = withTiming(1.3, { duration: decorativeDurations.pulse, easing: motionEasings.decelerate })
    } else {
      ringOpacity.value = withTiming(0, { duration: motionDurations.exitStack })
      ringScale.value = withTiming(1, { duration: motionDurations.exitStack })
      haloScale.value = withTiming(1, { duration: decorativeDurations.paintExit })
    }
    return () => {
      // Cancel in-flight tweens (especially the scanning ringScale
      // repeat) so the worklet drivers are torn down if the user
      // navigates away mid-scan.
      cancelAnimation(ringOpacity)
      cancelAnimation(ringScale)
      cancelAnimation(haloScale)
    }
  }, [reduced, status, ringOpacity, ringScale, haloScale])

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }))
  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: haloScale.value }],
  }))

  // Entrance fades for hero column
  const fadeUp = (delay: number) => ({ delay, duration: 600 })

  const triggerFaceID = useCallback(async () => {
    if (status !== 'idle' || isBusy) return
    await triggerHaptic('selection')
    actions.clearFeedback()
    setStatus('scanning')
    try {
      // Refactor (2026-06-11): el lock mode path se movió a
      // mobile/screens/auth/unlock-screen.tsx (dedicated route
      // /(auth)/unlock). El login screen ahora solo maneja sign-in normal.
      await actions.handleBiometricSignIn()
      // handleBiometricSignIn swallows every non-success path internally
      // (cancel / stale creds / network) and returns. On success it
      // navigates away (this screen unmounts). Reaching here = cancelled
      // or failed silently → reset to idle so the user can retry.
      setStatus('idle')
    } catch {
      // Defensive: handleBiometricSignIn doesn't throw today. Fall back
      // to the password form so the user has a path forward.
      setStatus('idle')
      userPickedModeRef.current = true
      setFormMode('use-password')
    }
  }, [actions, isBusy, status])

  // Auto-fire Face ID once when arriving with `?autoBiometric=1`.
  // Guarded by a ref so a setState-driven re-render (e.g. status flips
  // to 'scanning') doesn't re-enter the prompt. We also clear the
  // param via `router.setParams` so the trigger doesn't survive a
  // back-navigate or a remount.
  useEffect(() => {
    if (autoBiometricFiredRef.current) return
    if (params.autoBiometric !== '1') return
    if (!hasSavedBiometric) return
    if (isBusy || status !== 'idle') return
    autoBiometricFiredRef.current = true
    router.setParams({ autoBiometric: undefined })
    void triggerFaceID()
  }, [params.autoBiometric, hasSavedBiometric, isBusy, status, router, triggerFaceID])

  const handleSwitchAccount = useCallback(() => {
    void triggerHaptic('selection')
    userPickedModeRef.current = true
    setStatus('idle')
    setFormMode('change-account')
    actions.setEmail('')
    actions.setPassword('')
    setTimeout(() => {
      emailInputRef.current?.focus?.()
    }, 80)
  }, [actions, emailInputRef])

  // Apple Sign-In presence en login es requisito de Apple Guideline 4.8
  // (paridad con providers sociales ofrecidos en signup). El handler
  // delega en `signInWithApple` y deja que el AppLayout detecte la
  // sesión nueva — no necesitamos redirigir manualmente.
  const [appleAvailable, setAppleAvailable] = useState(false)
  useEffect(() => {
    let cancelled = false
    void isAppleSignInAvailable().then((value) => {
      if (!cancelled) setAppleAvailable(value)
    })
    return () => {
      cancelled = true
    }
  }, [])
  const [appleSigningIn, setAppleSigningIn] = useState(false)
  const [appleError, setAppleError] = useState<string | null>(null)

  // Sprint H · H2 — Anti-enumeration resend flow.
  //
  // Antes detectábamos "email not confirmed" en el errorMessage y
  // pintábamos un banner inline. Eso permitía enumeración pasiva: el
  // banner solo aparecía para emails registrados pero no confirmados,
  // así que un atacante que tipeara emails al azar identificaba cuáles
  // pertenecían a cuentas reales sin confirmar.
  //
  // Nuevo flujo:
  //   · use-login-submit ya colapsa todos los signin-errors a copy
  //     genérico ("Email o contraseña incorrectos"), así que el atacante
  //     no aprende nada del fallo.
  //   · Mostramos un link inline DEBAJO del form ("¿No te llegó el
  //     email de confirmación?") que el USUARIO clickea de manera
  //     proactiva. Al tocarlo abrimos el banner expandido con CTA de
  //     reenvío. Como cualquiera puede pedir el resend para cualquier
  //     email (Supabase responde igual si existe o no), no hay leak.
  //
  // El cooldown / rate-limit los maneja el hook compartido
  // (3 envíos / 5min + 60s cooldown).
  const resendConfirm = useResendConfirmEmail()
  const [confirmResendOpen, setConfirmResendOpen] = useState(false)
  const handleOpenConfirmResend = useCallback(() => {
    void triggerHaptic('selection')
    setConfirmResendOpen(true)
  }, [])
  const handleResendUnconfirmed = useCallback(async () => {
    if (!email || !email.includes('@')) return
    if (resendConfirm.secondsUntilRetry > 0) return
    await resendConfirm.resend(email)
    if (!resendConfirm.error) {
      void triggerHaptic('success')
      actions.setInfoMessage('Si esa cuenta existe, te llegará un email.')
    } else {
      void triggerHaptic('warning')
    }
  }, [actions, email, resendConfirm])
  const handleAppleSignIn = useCallback(async () => {
    if (appleSigningIn || isBusy) return
    void triggerHaptic('selection')
    if (!appleAvailable) {
      Alert.alert(
        'No disponible',
        Platform.OS === 'ios'
          ? 'Sign in with Apple no está habilitado en este dispositivo.'
          : 'Sign in with Apple solo está disponible en iOS.',
      )
      return
    }
    setAppleSigningIn(true)
    setAppleError(null)
    try {
      const result = await signInWithApple()
      if (result.status === 'signed-in') {
        await triggerHaptic('success')
        // Apple sign-in es un evento de auth explícito: la máquina
        // entra al bridge, marca unlocked (confirm-session) y navega
        // al destino resuelto cuando el overlay está opaco.
        dispatchAuthFlow({ type: 'LOGIN_SUCCESS' })
        return
      }
      if (result.status === 'cancelled') return
      await triggerHaptic('warning')
      setAppleError(result.error ?? 'No pudimos continuar con Apple.')
    } finally {
      setAppleSigningIn(false)
    }
  }, [appleAvailable, appleSigningIn, isBusy])

  const handleUsePassword = useCallback(() => {
    void triggerHaptic('selection')
    userPickedModeRef.current = true
    // Pre-populate the email field with the cached user's email so the
    // submit flow has everything it needs from just the password input
    // — no email field is rendered in use-password mode.
    if (!email && lastUser?.email) {
      actions.setEmail(lastUser.email)
    }
    setFormMode('use-password')
    setTimeout(() => {
      passwordInputRef.current?.focus?.()
    }, 80)
  }, [actions, email, lastUser, passwordInputRef])

  const handleCancelForm = useCallback(() => {
    void triggerHaptic('light')
    // Reset the password the user typed; keep the email so re-entering
    // a mode doesn't lose context. formMode=null restores the buttons
    // state so the user can pick a different method.
    actions.setPassword('')
    setFormMode(null)
  }, [actions])


  const handleBack = useCallback(() => {
    void triggerHaptic('light')
    if (router.canGoBack()) router.back()
    else router.replace('/(auth)/welcome')
  }, [router])

  const submitPassword = useCallback(() => {
    void actions.handleSubmit()
  }, [actions])

  const ctaLabel =
    status === 'scanning'
      ? 'Reconociendo'
      : `Entrar con ${biometricState.label || 'Face ID'}`

  const ctaBg = DARK_GREEN

  // Which action block to render. Centralised in a pure helper so the
  // lock-mode invariant (Face ID CTA always available — see
  // login-action-view.ts) is explicit and regression-tested.
  const actionView = resolveLoginActionView({
    formMode,
    isLockMode: false,
    hasSavedBiometric,
    isReturningUser,
  })

  const body = (
    <>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      {/*
        Standard mobile login pattern: a single ScrollView wraps the
        entire screen and `automaticallyAdjustKeyboardInsets` (Screen
        default) shifts the WHOLE content up together when the keyboard
        opens — topNav, hero and actions all move as one unit. No
        inner scroll view, no bottom-pinned actions: the content lives
        as one continuous block, which is what users expect on iOS /
        Android forms.
        `flexGrow: 1` + `justifyContent: 'space-between'` makes the
        three top-level children distribute when content is short
        (topNav at top, hero centered, actions near bottom) without
        introducing a flex split that would break the unified scroll.
      */}
      <Screen
        contentContainerStyle={styles.screenContent}
        bodyStyle={styles.screenBody}
        scrollRef={scrollRef}
      >
        {/* Top nav */}
        <View style={styles.topNav}>
          <Pressable
            accessibilityLabel="Volver"
            accessibilityRole="button"
            hitSlop={DEFAULT_HIT_SLOP}
            onPress={handleBack}
            style={styles.navButton}
          >
            <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
              <Path
                d="M11 4l-5 5 5 5"
                stroke={theme.colors.text}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
          <FernLogo size={28} palette={theme.isDark ? 'light' : 'dark'} />
          <View style={styles.navSpacer} />
        </View>

        <View style={styles.heroBlockOuter}>
          {isReturningUser ? (
            <Animated.View entering={undefined} style={styles.heroBlock}>
              <FadeInUp reduced={reduced} {...fadeUp(100)}>
                <Text style={[styles.eyebrow, { color: theme.colors.textSoft }]}>
                  {returningGreeting}
                </Text>
              </FadeInUp>
              <FadeInUp reduced={reduced} {...fadeUp(200)}>
                <Text style={[styles.title, { color: theme.colors.text }]}>
                  Hola, {greeting}
                </Text>
              </FadeInUp>

              {/* Avatar with halo + ring */}
              <FadeInUp reduced={reduced} {...fadeUp(300)} style={styles.avatarWrap}>
                <View style={styles.avatarSlot}>
                  <Animated.View style={[styles.halo, haloStyle]} />
                  <Animated.View style={[styles.ring, ringStyle]} />
                  <View style={styles.avatar}>
                    <LinearGradient
                      colors={[PEACH, CLAY]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                    {lastUserAvatarSlug ? (
                      // Personalized animal avatar from the cached
                      // profile — set after every successful session.
                      <AvatarAnimal
                        slug={lastUserAvatarSlug}
                        size={88}
                        tint={CREAM}
                        backgroundTint="transparent"
                      />
                    ) : (
                      // Fern fallback when no avatar slug has been
                      // cached yet (legacy install, brand-new account).
                      // Logo ENTERO (con tallo) — decisión owner 2026-06-11.
                      <FernLogo size={64} palette="mono-light" />
                    )}
                  </View>
                </View>
              </FadeInUp>

              <FadeInUp reduced={reduced} {...fadeUp(400)}>
                <Text
                  style={[styles.emailMicro, { color: theme.colors.textSoft }]}
                  numberOfLines={1}
                >
                  {email || lastUser?.email || 'tu cuenta guardada'}
                </Text>
              </FadeInUp>

            </Animated.View>
          ) : (
            // First-time login (no stored session): unisex welcome-back
            // greeting for users who already have an account but are
            // signing in fresh after an install. No name, no
            // "tu cuenta guardada", no "Toca para identificarte" — those
            // are Face ID copy. The avatar keeps the Fern brand mark.
            <View style={styles.heroBlock}>
              <FadeInUp reduced={reduced} {...fadeUp(100)}>
                <Text style={[styles.eyebrow, { color: theme.colors.textSoft }]}>
                  Qué bueno verte
                </Text>
              </FadeInUp>
              <FadeInUp reduced={reduced} {...fadeUp(200)}>
                <Text style={[styles.title, { color: theme.colors.text }]}>
                  ¡Hola de vuelta! 👋
                </Text>
              </FadeInUp>

              <FadeInUp reduced={reduced} {...fadeUp(300)} style={styles.avatarWrap}>
                <View style={styles.avatarSlot}>
                  <View style={styles.avatar}>
                    <LinearGradient
                      colors={[PEACH, CLAY]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <FernLogo size={64} palette="mono-light" />
                  </View>
                </View>
              </FadeInUp>

              <FadeInUp reduced={reduced} {...fadeUp(400)}>
                <Text style={[styles.welcomeBackSub, { color: theme.colors.textSoft }]}>
                  Ingresa tus datos para volver a tu cuenta.
                </Text>
              </FadeInUp>
            </View>
          )}
        </View>

        <View style={styles.actionsStack}>
          {/* J-Auth2: when the last user on this device has a pending
              deletion, surface the cancel-deletion CTA before the
              regular login controls. The banner self-hides if there's
              no pending state. */}
          <WelcomeCancelDeletionBanner loginHref="/(auth)/login" />
          {actionView === 'password-form' && formMode ? (
              <>
                <PasswordForm
                  mode={formMode}
                  storedEmail={email}
                  emailRef={emailInputRef}
                  errorMessage={errorMessage}
                  infoMessage={infoMessage}
                  isBusy={isBusy}
                  isReducedMotionEnabled={isReducedMotionEnabled}
                  onCancel={isReturningUser ? handleCancelForm : undefined}
                  onChangeEmail={actions.setEmail}
                  onChangePassword={actions.setPassword}
                  onSubmit={submitPassword}
                  password={password}
                  passwordRef={passwordInputRef}
                  colors={theme.colors}
                />
                {/* H2: anti-enumeration — link is always visible (not
                    gated on error shape) so it leaks nothing. Tapping
                    expands the resend block. */}
                {confirmResendOpen ? (
                  <UnconfirmedEmailBanner
                    busy={resendConfirm.isPending}
                    rateLimited={resendConfirm.rateLimited}
                    cooldownSeconds={resendConfirm.secondsUntilRetry}
                    error={resendConfirm.error}
                    onResend={() => void handleResendUnconfirmed()}
                    colors={theme.colors}
                  />
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="¿No te llegó el email de confirmación?"
                    hitSlop={DEFAULT_HIT_SLOP}
                    onPress={handleOpenConfirmResend}
                    style={({ pressed }) => [
                      styles.confirmResendLink,
                      { opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.confirmResendLinkLabel,
                        { color: theme.colors.textSoft },
                      ]}
                    >
                      ¿No te llegó el email de confirmación?
                    </Text>
                  </Pressable>
                )}
                {appleAvailable ? (
                  <AppleSignInRow
                    busy={appleSigningIn}
                    error={appleError}
                    onPress={() => void handleAppleSignIn()}
                    colors={theme.colors}
                    withDivider
                  />
                ) : null}
              </>
            ) : actionView === 'face-id' ? (
              <>
                {errorMessage ? (
                  <FeedbackPill intent="error" message={errorMessage} />
                ) : null}
                {!errorMessage && infoMessage ? (
                  <FeedbackPill intent="info" message={infoMessage} />
                ) : null}
                <Pressable
                  accessibilityLabel={ctaLabel}
                  accessibilityRole="button"
                  disabled={status !== 'idle' || isBusy}
                  onPress={triggerFaceID}
                  style={({ pressed }) => [
                    styles.primaryCta,
                    {
                      backgroundColor: ctaBg,
                      opacity:
                        pressed && status === 'idle'
                          ? 0.92
                          : status === 'scanning'
                            ? 0.85
                            : 1,
                    },
                  ]}
                >
                  <FaceIDIcon size={26} color={CREAM} scanning={status === 'scanning'} />
                  <Text style={styles.primaryCtaLabel}>{ctaLabel}</Text>
                </Pressable>

                <View style={styles.secondaryRow}>
                  <Pressable
                    accessibilityLabel="Usar contraseña"
                    accessibilityRole="button"
                    hitSlop={DEFAULT_HIT_SLOP}
                    onPress={handleUsePassword}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      { borderColor: theme.colors.line },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={[styles.secondaryLabel, { color: theme.colors.text }]}>
                      Usar contraseña
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Cambiar cuenta"
                    accessibilityRole="button"
                    hitSlop={DEFAULT_HIT_SLOP}
                    onPress={handleSwitchAccount}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      { borderColor: theme.colors.line },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={[styles.secondaryLabel, { color: theme.colors.text }]}>
                      Cambiar cuenta
                    </Text>
                  </Pressable>
                </View>
                {appleAvailable ? (
                  <AppleSignInRow
                    busy={appleSigningIn}
                    error={appleError}
                    onPress={() => void handleAppleSignIn()}
                    colors={theme.colors}
                  />
                ) : null}
              </>
            ) : actionView === 'secondary-only' ? (
              // Cached profile from a previous login but biometric isn't
              // saved (or the device doesn't support it). Skip the
              // Face ID CTA and show just the secondary actions.
              <View style={styles.secondaryRow}>
                <Pressable
                  accessibilityLabel="Usar contraseña"
                  accessibilityRole="button"
                  hitSlop={DEFAULT_HIT_SLOP}
                  onPress={handleUsePassword}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    { borderColor: theme.colors.line },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={[styles.secondaryLabel, { color: theme.colors.text }]}>
                    Usar contraseña
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Cambiar cuenta"
                  accessibilityRole="button"
                  hitSlop={DEFAULT_HIT_SLOP}
                  onPress={handleSwitchAccount}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    { borderColor: theme.colors.line },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={[styles.secondaryLabel, { color: theme.colors.text }]}>
                    Cambiar cuenta
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {actionView !== 'password-form' &&
            actionView !== 'face-id' &&
            appleAvailable ? (
              <AppleSignInRow
                busy={appleSigningIn}
                error={appleError}
                onPress={() => void handleAppleSignIn()}
                colors={theme.colors}
              />
            ) : null}
        </View>
      </Screen>
      {/* Sprint F · F14: render the captcha widget alongside the screen
          so `resolveCaptchaToken` above can open it before sign-in.
          The modal stays hidden when captcha isn't configured because
          `request()` short-circuits to null without flipping `visible`. */}
      <CaptchaModal visible={captcha.visible} onComplete={captcha.onComplete} />
    </>
  )

  // Login siempre va a través de RequireGuest. El ex-path de lock-mode
  // (skip guard) se removió en el refactor 2026-06-11 — el unlock vive
  // en /(auth)/unlock con su propio screen dedicado.
  return (
    <RequireGuest allowFamilylessSession>{body}</RequireGuest>
  )
}

interface PasswordFormProps {
  mode: 'use-password' | 'change-account'
  storedEmail: string
  emailRef: React.RefObject<TextInput | null>
  errorMessage: string | null
  infoMessage: string | null
  isBusy: boolean
  isReducedMotionEnabled: boolean
  onCancel?: () => void
  onChangeEmail: (value: string) => void
  onChangePassword: (value: string) => void
  onSubmit: () => void
  password: string
  passwordRef: React.RefObject<TextInput | null>
  colors: ThemeColors
}

function PasswordForm({
  mode,
  storedEmail,
  emailRef,
  errorMessage,
  infoMessage,
  isBusy,
  isReducedMotionEnabled,
  onCancel,
  onChangeEmail,
  onChangePassword,
  onSubmit,
  password,
  passwordRef,
  colors,
}: PasswordFormProps) {
  const isUsePassword = mode === 'use-password'
  const formRouter = useRouter()
  return (
    <FadeInUp reduced={isReducedMotionEnabled} delay={50} duration={260} style={styles.passwordForm}>
      {/*
        use-password mode: the cached email is already implicit (shown
        in the hero above and pre-populated into the controller via
        `handleUsePassword`), so the form renders ONLY the password
        input. change-account mode shows both email + password.
      */}
      {isUsePassword ? null : (
        <TextField
          accessibilityLabel="Email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          label="Email"
          onChangeText={onChangeEmail}
          placeholder="nombre@correo.com"
          ref={emailRef}
          returnKeyType="next"
          textContentType="emailAddress"
          value={storedEmail}
          onSubmitEditing={() => passwordRef.current?.focus?.()}
        />
      )}

      <PasswordField
        accessibilityLabel="Contraseña"
        label="Contraseña"
        onChangeText={onChangePassword}
        placeholder="••••••••"
        ref={passwordRef}
        returnKeyType="go"
        textContentType="password"
        value={password}
        onSubmitEditing={onSubmit}
      />

      {errorMessage ? <FeedbackPill intent="error" message={errorMessage} /> : null}
      {!errorMessage && infoMessage ? <FeedbackPill intent="info" message={infoMessage} /> : null}

      <Pressable
        accessibilityLabel="Continuar"
        accessibilityRole="button"
        disabled={isBusy}
        onPress={onSubmit}
        style={({ pressed }) => [
          styles.passwordCta,
          { backgroundColor: DARK_GREEN, opacity: pressed || isBusy ? 0.85 : 1 },
        ]}
      >
        <Text style={styles.primaryCtaLabel}>Continuar</Text>
      </Pressable>

      <Pressable
        accessibilityLabel="Olvidé mi contraseña"
        accessibilityRole="button"
        hitSlop={DEFAULT_HIT_SLOP}
        onPress={() => formRouter.push('/(auth)/forgot-password')}
        style={({ pressed }) => [styles.forgotLink, pressed && { opacity: 0.6 }]}
      >
        <Text style={[styles.cancelLabel, { color: colors.textSoft }]}>
          ¿Olvidaste tu contraseña?
        </Text>
      </Pressable>

      {onCancel ? (
        <Pressable
          accessibilityLabel="Elegir otro método de inicio de sesión"
          accessibilityRole="button"
          hitSlop={DEFAULT_HIT_SLOP}
          onPress={onCancel}
          style={({ pressed }) => [styles.cancelLink, pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.cancelLabel, { color: colors.textSoft }]}>
            Volver · elegir otro método
          </Text>
        </Pressable>
      ) : null}
    </FadeInUp>
  )
}

function FaceIDIcon({
  size = 26,
  color = CREAM,
  scanning = false,
}: {
  size?: number
  color?: string
  scanning?: boolean
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      {/* Corners */}
      <Path d="M3 9V5a2 2 0 012-2h4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M19 3h4a2 2 0 012 2v4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M25 19v4a2 2 0 01-2 2h-4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M9 25H5a2 2 0 01-2-2v-4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      {/* Eyes */}
      <Circle cx={11} cy={12} r={0.8} fill={color} />
      <Circle cx={17} cy={12} r={0.8} fill={color} />
      {/* Nose + mouth */}
      <Path d="M14 12v3.5" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Path
        d="M11.5 18c.8.7 1.6 1 2.5 1s1.7-.3 2.5-1"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {scanning ? (
        <Path d="M3 14h22" stroke={CLAY} strokeWidth={1.5} strokeLinecap="round" />
      ) : null}
    </Svg>
  )
}

interface FadeInUpProps {
  delay?: number
  duration?: number
  reduced?: boolean
  style?: object
  children: React.ReactNode
}

function FadeInUp({ delay = 0, duration = 600, reduced, style, children }: FadeInUpProps) {
  const y = useSharedValue(reduced ? 0 : 8)
  const opacity = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) {
      y.value = 0
      opacity.value = 1
      return
    }
    y.value = withDelay(delay, withTiming(0, { duration, easing: Easing.out(Easing.cubic) }))
    opacity.value = withDelay(delay, withTiming(1, { duration }))
  }, [delay, duration, opacity, reduced, y])
  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }))
  return <Animated.View style={[style, animated]}>{children}</Animated.View>
}

const styles = StyleSheet.create({
  // Single scrollable column. `flexGrow: 1` makes the contentContainer
  // fill the ScrollView; the inner `bodyStyle` wrapper picks up the
  // flex and distributes the three sections via `space-between`.
  screenContent: {
    flexGrow: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 16,
    gap: 0,
  },
  // The Animated.View inside Screen would otherwise size to its
  // children (intrinsic) — by stretching it with `flex: 1` we get
  // `justifyContent: 'space-between'` to actually distribute the
  // topNav, hero and actions to the top, middle, and bottom.
  // When the keyboard opens, the ScrollView's auto insets scroll the
  // whole column up TOGETHER (single scroll region, no inner split).
  screenBody: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topNav: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 0,
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: {
    padding: 8,
    margin: -8,
  },
  navSpacer: {
    width: 24,
  },
  // Wrapper around the hero block — owns horizontal padding so the
  // hero stays edge-aligned with the topNav/actions. The ScrollView
  // contentContainer's `justifyContent: 'space-between'` centers this
  // block vertically when content is short.
  heroBlockOuter: {
    paddingHorizontal: 28,
  },
  heroBlock: {
    alignItems: 'center',
  },
  // Actions stack — same horizontal padding as the hero so the surface
  // reads as one continuous column.
  actionsStack: {
    paddingHorizontal: 28,
    paddingTop: 12,
    gap: 14,
  },
  // Hero text colors (eyebrow / title / sub / email) are overridden at
  // render time with theme-aware values so they adapt to dark mode.
  eyebrow: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.2,
    marginBottom: 10,
    textAlign: 'center',
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.5,
    textAlign: 'center',
  },
  avatarWrap: {
    marginTop: 40,
    width: 128,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSlot: {
    width: 128,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: authTokens.focusRingGlow,
  },
  ring: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: CLAY,
  },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: CREAM,
  },
  welcomeBackSub: {
    marginTop: 18,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
  },
  emailMicro: {
    marginTop: 18,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  primaryCta: {
    width: '100%',
    height: 60,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: DARK_GREEN,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 6,
  },
  primaryCtaLabel: {
    color: CREAM,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  passwordForm: {
    gap: 14,
  },
  cancelLink: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  cancelLabel: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  passwordCta: {
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  forgotLink: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 2,
  },
  appleDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  appleDividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  appleDividerLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
  },
  appleButton: {
    marginTop: 10,
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#000',
  },
  appleButtonLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  appleErrorLabel: {
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center',
  },
  confirmResendLink: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  confirmResendLinkLabel: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.1,
    textDecorationLine: 'underline',
  },
  unconfirmedBanner: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  unconfirmedTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  unconfirmedBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  unconfirmedCta: {
    marginTop: 4,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },
  unconfirmedCtaLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  unconfirmedError: {
    fontSize: 12,
    textAlign: 'center',
  },
})

interface UnconfirmedEmailBannerProps {
  busy: boolean
  rateLimited: boolean
  cooldownSeconds: number
  error: string | null
  onResend: () => void
  colors: ThemeColors
}

function UnconfirmedEmailBanner({
  busy,
  rateLimited,
  cooldownSeconds,
  error,
  onResend,
  colors,
}: UnconfirmedEmailBannerProps) {
  const disabled = busy || rateLimited || cooldownSeconds > 0
  const label = busy
    ? 'Reenviando…'
    : rateLimited
      ? 'Reintentá en unos minutos'
      : cooldownSeconds > 0
        ? `Reenviar en ${cooldownSeconds}s`
        : 'Reenviar email'
  return (
    <View
      style={[
        styles.unconfirmedBanner,
        { backgroundColor: colors.surfaceMuted, borderColor: colors.line },
      ]}
    >
      <Text style={[styles.unconfirmedTitle, { color: colors.text }]}>
        Confirmá tu email para entrar
      </Text>
      <Text style={[styles.unconfirmedBody, { color: colors.textSoft }]}>
        Te mandamos un link cuando creaste la cuenta. Si no lo ves, revisá
        spam o pedí uno nuevo.
      </Text>
      <Pressable
        accessibilityLabel="Reenviar email de confirmación"
        accessibilityRole="button"
        disabled={disabled}
        onPress={onResend}
        style={({ pressed }) => [
          styles.unconfirmedCta,
          {
            backgroundColor: disabled ? colors.surfaceMuted : DARK_GREEN,
            opacity: pressed && !disabled ? 0.9 : 1,
          },
        ]}
      >
        <Text
          style={[
            styles.unconfirmedCtaLabel,
            { color: disabled ? colors.textSoft : CREAM },
          ]}
        >
          {label}
        </Text>
      </Pressable>
      {error ? (
        <Text style={[styles.unconfirmedError, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}

interface AppleSignInRowProps {
  busy: boolean
  error: string | null
  onPress: () => void
  colors: ThemeColors
  withDivider?: boolean
}

function AppleSignInRow({ busy, error, onPress, colors, withDivider }: AppleSignInRowProps) {
  return (
    <View>
      {withDivider ? (
        <View style={styles.appleDivider}>
          <View style={[styles.appleDividerLine, { backgroundColor: colors.line }]} />
          <Text style={[styles.appleDividerLabel, { color: colors.textSoft }]}>O</Text>
          <View style={[styles.appleDividerLine, { backgroundColor: colors.line }]} />
        </View>
      ) : null}
      <Pressable
        accessibilityLabel="Continuar con Apple"
        accessibilityRole="button"
        disabled={busy}
        onPress={onPress}
        style={({ pressed }) => [
          styles.appleButton,
          { opacity: pressed || busy ? 0.85 : 1 },
        ]}
      >
        <Svg width={16} height={18} viewBox="0 0 16 18" fill="none">
          <Path
            d="M13.62 9.55c-.02-2.18 1.78-3.23 1.86-3.28-1.01-1.48-2.59-1.68-3.16-1.7-1.34-.14-2.61.79-3.29.79-.68 0-1.73-.77-2.84-.75-1.46.02-2.81.85-3.56 2.15-1.52 2.63-.39 6.52 1.09 8.65.72 1.04 1.58 2.21 2.69 2.17 1.08-.04 1.49-.7 2.79-.7 1.31 0 1.68.7 2.83.68 1.17-.02 1.91-1.06 2.62-2.11.83-1.21 1.17-2.39 1.19-2.45-.03-.01-2.29-.88-2.31-3.48l.09.03ZM11.49 3.31c.59-.71 1-1.71.89-2.71-.86.04-1.91.57-2.52 1.28-.55.63-1.03 1.64-.9 2.62.97.08 1.95-.49 2.53-1.19Z"
            fill="#fff"
          />
        </Svg>
        <Text style={styles.appleButtonLabel}>
          {busy ? 'Conectando…' : 'Continuar con Apple'}
        </Text>
      </Pressable>
      {error ? (
        <Text style={[styles.appleErrorLabel, { color: colors.danger }]}>{error}</Text>
      ) : null}
    </View>
  )
}
