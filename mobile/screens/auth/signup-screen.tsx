import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import Svg, { Path } from 'react-native-svg'
import { RequireGuest } from '@/components/guards'
import { TextField } from '@/components/ui/text-field'
import { FeedbackPill } from '@/components/auth/auth-feedback-pill'
import { FernLogo } from '@/components/auth/fern-logo'
import { Screen } from '@/components/ui/screen'
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
import { CaptchaModal } from '@/components/auth/captcha-modal'
import { resolveAuthSubmitResolution } from '@/features/auth/auth-submit-flow'
import { normalizeEmail } from '@/features/auth/auth-flow'
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/lib/legal-urls'
import {
  hideAuthTransitionSplash,
  showAuthTransitionSplash,
} from '@/lib/auth-transition-splash'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { getErrorMessage } from '@/utils/error-message'
import { authTokens } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { DEFAULT_HIT_SLOP } from '@/theme/interaction'

// Brand primary stays static across themes — CTA is meant to read as
// "Manifiesto" regardless of light/dark canvas (same idea as Apple's
// blue or Spotify's green).
const BRAND_GREEN = authTokens.welcomeBg
const BRAND_CREAM_ON_GREEN = authTokens.surfaceCream

/**
 * Signup screen — single page, no wizard.
 *
 * Identidad mínima en una sola vista:
 *  · Apple / Google (one-tap, the modern default)
 *  · O · email + nombre + contraseña + Continuar
 *
 * The wizard pattern is overkill for the data we actually need to
 * create the account. The family decision and full profile (avatar,
 * sueldo, ahorros) live in `/onboarding`, which runs after sign-up
 * resolves — duplicating those questions here would mean asking the
 * user the same thing twice.
 *
 * Reuses `usePasswordSignUp` (the same mutation used by `useLoginSubmit`)
 * and the post-signup resolution helper to decide between email-
 * confirmation info or handing off to `/(app)/onboarding` (the 5-step
 * wizard, which covers family + profile in step 3+).
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  if (local.length <= 2) return `${local[0]}***@${domain}`
  return `${local[0]}${local[1]}***@${domain}`
}

export function SignupScreen() {
  const router = useRouter()
  const reduced = useReducedMotion()
  const passwordSignUp = usePasswordSignUp()
  const captcha = useCaptcha()
  const resendConfirm = useResendConfirmEmail()
  // Destructured para que el useCallback de submitSignup pueda depender
  // sólo de la fn (estable via useCallback adentro del hook) en vez del
  // object completo, que cambia de identidad por render. CR Sprint A #5.
  const startResendCooldown = resendConfirm.startCooldown
  const { theme } = useAppTheme()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [isSubmitting, setSubmitting] = useState(false)
  // Estado del flujo de confirmación por email. Se setea cuando
  // resolveAuthSubmitResolution decide "email-confirmation" (Supabase
  // requiere verificar el mail antes de tener sesión).
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null)

  const resendCooldownSeconds = resendConfirm.secondsUntilRetry

  const handleResendConfirmation = useCallback(async () => {
    if (!confirmationEmail) return
    if (resendCooldownSeconds > 0) return
    setErrorMessage(null)
    const previousError = resendConfirm.error
    await resendConfirm.resend(confirmationEmail)
    // El hook expone `error` reactivo; si cambió detectamos fallo.
    if (resendConfirm.error && resendConfirm.error !== previousError) {
      await triggerHaptic('error')
      setErrorMessage(resendConfirm.error)
      return
    }
    setInfoMessage('Te reenviamos el email. Revisá también spam.')
    await triggerHaptic('success')
  }, [confirmationEmail, resendCooldownSeconds, resendConfirm])

  const handleChangeEmail = useCallback(() => {
    // Clear any lingering splash from the prior submit/confirmation
    // attempt so the form re-appears cleanly.
    hideAuthTransitionSplash()
    setConfirmationEmail(null)
    setInfoMessage(null)
    setEmail('')
    emailRef.current?.focus?.()
  }, [])

  const nameRef = useRef<TextInput | null>(null)
  const emailRef = useRef<TextInput | null>(null)
  const passwordRef = useRef<TextInput | null>(null)

  const canSubmit = useMemo(
    () =>
      name.trim().length > 1 && email.includes('@') && password.length >= 8,
    [email, name, password.length],
  )

  const handleBack = useCallback(() => {
    // Clear any lingering splash from the prior submit/confirmation
    // attempt so the form re-appears cleanly.
    hideAuthTransitionSplash()
    void triggerHaptic('light')
    if (router.canGoBack()) router.back()
    else router.replace('/(auth)/welcome')
  }, [router])

  const submitSignup = useCallback(async () => {
    if (isSubmitting) return
    const normalizedEmail = normalizeEmail(email)
    const trimmedName = name.trim()
    const trimmedPassword = password.trim()

    if (trimmedName.length < 2) {
      setErrorMessage('Agrega un nombre para tu perfil.')
      await triggerHaptic('warning')
      nameRef.current?.focus?.()
      return
    }
    if (!normalizedEmail.includes('@')) {
      setErrorMessage('Ingresa un email válido.')
      await triggerHaptic('warning')
      emailRef.current?.focus?.()
      return
    }
    if (trimmedPassword.length < 8) {
      setErrorMessage('La contraseña debe tener al menos 8 caracteres.')
      await triggerHaptic('warning')
      passwordRef.current?.focus?.()
      return
    }

    setSubmitting(true)
    setErrorMessage(null)
    setInfoMessage(null)
    try {
      // Captcha gate (sprint B · B3). Si está configurado, abrimos el
      // widget y esperamos un token antes de hacer el signUp. Si no
      // está configurado (env vacío), `request()` resuelve `null` y
      // mandamos undefined a Supabase — el server lo ignora silently
      // si el captcha tampoco está habilitado del lado backend.
      let captchaToken: string | undefined
      if (captcha.isConfigured) {
        const token = await captcha.request()
        if (!token) {
          // Cancel / error / expired — no avanzamos.
          setSubmitting(false)
          await triggerHaptic('warning')
          setErrorMessage('No pudimos verificar el captcha. Probá de nuevo.')
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
        // El email ya salió como parte del signUp; no disparamos un
        // segundo envío. Sólo arrancamos el cooldown visible para
        // que el botón "Reenviar" arranque deshabilitado los próximos 60s.
        startResendCooldown()
        return
      }

      showAuthTransitionSplash()
      // Hand off to the pre-onboarding biometric-setup gate. AppEntryGate
      // falls through to /(app)/onboarding if the user already saw the
      // biometric-setup screen (flag set). Apple/Google + magic-link
      // flows hit the same gate via cold-start.
      //
      // We route directly instead of dispatching on `resolution.type`:
      // `email-confirmation` returns early above (line 203), so by here
      // `resolution.type` is provably `'onboarding'` with
      // `href === '/(app)/biometric-setup'`. Hard-coding the destination
      // avoids the dead-code ternary that earlier hid a routing bug
      // (the ternary would re-resolve to `/(app)/onboarding` if the
      // shared `resolveAuthSubmitResolution` href ever drifted again).
      router.replace('/(app)/biometric-setup')
    } catch (error) {
      await triggerHaptic('error')
      setErrorMessage(getErrorMessage(error, 'No pudimos crear tu cuenta.'))
    } finally {
      setSubmitting(false)
    }
  }, [captcha, email, isSubmitting, name, password, passwordSignUp, router, startResendCooldown])

  // Track availability so we can disable buttons cleanly when the
  // platform / config doesn't support a provider (e.g. Android shows
  // the Apple button as unavailable; Google needs env vars wired).
  const [appleAvailable, setAppleAvailable] = useState(false)
  const googleAvailable = isGoogleSignInConfigured()
  useEffect(() => {
    let cancelled = false
    void isAppleSignInAvailable().then((value) => {
      if (!cancelled) setAppleAvailable(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSocialResult = useCallback(
    async (label: string, runner: () => Promise<SocialSignInResult>) => {
      if (isSubmitting) return
      setSubmitting(true)
      setErrorMessage(null)
      setInfoMessage(null)
      try {
        const result = await runner()
        if (result.status === 'signed-in') {
          await triggerHaptic('success')
          showAuthTransitionSplash()
          // Apple/Google sign-up = same as email signup → biometric-setup
          // gate first (activate Face ID), then 5-step onboarding handles
          // family + profile. The session arrives already email-confirmed
          // (provider-verified), so we never need to route through
          // /(auth)/join for these.
          router.replace('/(app)/biometric-setup')
          return
        }
        if (result.status === 'cancelled') {
          // user dismissed the native prompt — silent, no error UI
          return
        }
        await triggerHaptic('warning')
        setErrorMessage(result.error ?? `No pudimos continuar con ${label}.`)
      } finally {
        setSubmitting(false)
      }
    },
    [isSubmitting, router],
  )

  const handleAppleSignUp = useCallback(() => {
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
    void handleSocialResult('Apple', signInWithApple)
  }, [appleAvailable, handleSocialResult])

  const handleGoogleSignUp = useCallback(() => {
    void triggerHaptic('selection')
    if (!googleAvailable) {
      Alert.alert(
        'No disponible',
        'Google sign-in todavía no está configurado en este build.',
      )
      return
    }
    void handleSocialResult('Google', signInWithGoogle)
  }, [googleAvailable, handleSocialResult])

  // Strength meter for the password input — gives the user a quick
  // visual indicator without forcing extra steps.
  const strength =
    password.length === 0 ? 0 : password.length < 8 ? 1 : password.length < 12 ? 2 : 3
  const strengthLabel = ['', 'Débil', 'Buena', 'Excelente'][strength]
  const strengthColor =
    strength === 1
      ? authTokens.strengthWeak
      : strength === 2
        ? authTokens.strengthGood
        : strength === 3
          ? authTokens.strengthStrong
          : theme.colors.textSoft

  return (
    <RequireGuest allowFamilylessSession>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Screen contentContainerStyle={styles.screenContent}>
        {/* Top nav */}
        <View style={styles.topNav}>
          <Pressable
            accessibilityLabel="Volver"
            accessibilityRole="button"
            hitSlop={DEFAULT_HIT_SLOP}
            onPress={handleBack}
            style={styles.navButton}
          >
            <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
              <Path
                d="M13 5l-6 6 6 6"
                stroke={theme.colors.text}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
          <FernLogo size={26} palette={theme.isDark ? 'light' : 'dark'} iconMode />
          <View style={styles.navSpacer} />
        </View>

        <View style={styles.body}>
          <FadeInUp delay={0} reduced={reduced} style={styles.heroBlock}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              Crear cuenta
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
              Empieza a organizar tus finanzas en menos de un minuto.
            </Text>
          </FadeInUp>

          {/* Email + password form — primary path at the top. */}
          <FadeInUp delay={100} reduced={reduced} style={styles.formBlock}>
            <TextField
              accessibilityLabel="Tu nombre"
              autoCapitalize="words"
              autoCorrect={false}
              label="Nombre"
              onChangeText={(v) => {
                setErrorMessage(null)
                setName(v)
              }}
              placeholder="Nombre completo"
              ref={nameRef}
              returnKeyType="next"
              textContentType="givenName"
              value={name}
              onSubmitEditing={() => emailRef.current?.focus?.()}
            />
            <TextField
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              label="Email"
              onChangeText={(v) => {
                setErrorMessage(null)
                setEmail(v)
              }}
              placeholder="nombre@correo.com"
              ref={emailRef}
              returnKeyType="next"
              textContentType="emailAddress"
              value={email}
              onSubmitEditing={() => passwordRef.current?.focus?.()}
            />
            <View>
              <TextField
                accessibilityLabel="Contraseña"
                autoCapitalize="none"
                autoCorrect={false}
                label="Contraseña"
                onChangeText={(v) => {
                  setErrorMessage(null)
                  setPassword(v)
                }}
                placeholder="••••••••"
                ref={passwordRef}
                returnKeyType="go"
                secureTextEntry
                textContentType="newPassword"
                value={password}
                onSubmitEditing={() => {
                  if (canSubmit) void submitSignup()
                }}
              />
              {password.length > 0 ? (
                <View style={styles.strengthRow}>
                  <View style={styles.strengthBars}>
                    {[1, 2, 3].map((i) => (
                      <View
                        key={i}
                        style={[
                          styles.strengthBar,
                          {
                            backgroundColor:
                              strength >= i ? strengthColor : theme.colors.lineSoft,
                          },
                        ]}
                      />
                    ))}
                  </View>
                  <Text
                    style={[
                      styles.strengthLabel,
                      { color: strength === 0 ? theme.colors.textSoft : strengthColor },
                    ]}
                  >
                    {strengthLabel}
                  </Text>
                </View>
              ) : null}
            </View>

            {errorMessage ? (
              <FeedbackPill intent="error" message={errorMessage} />
            ) : null}
            {!errorMessage && infoMessage ? (
              <FeedbackPill intent="info" message={infoMessage} />
            ) : null}

            {confirmationEmail ? (
              <View
                style={[
                  styles.confirmationPanel,
                  {
                    backgroundColor: theme.colors.surfaceMuted,
                    borderColor: theme.colors.line,
                  },
                ]}
              >
                <Text style={[styles.confirmationTitle, { color: theme.colors.text }]}>
                  Te mandamos un mail a {maskEmail(confirmationEmail)}
                </Text>
                <Text style={[styles.confirmationBody, { color: theme.colors.textSoft }]}>
                  Confirmá desde el link para entrar. Revisá spam si no lo ves.
                </Text>
                <View style={styles.confirmationActions}>
                  <Pressable
                    accessibilityLabel="Reenviar email de confirmación"
                    accessibilityRole="button"
                    disabled={
                      resendCooldownSeconds > 0 ||
                      resendConfirm.isPending ||
                      resendConfirm.rateLimited
                    }
                    onPress={() => void handleResendConfirmation()}
                    style={({ pressed }) => [
                      styles.confirmationPrimary,
                      {
                        backgroundColor:
                          resendCooldownSeconds > 0
                            ? theme.colors.surfaceMuted
                            : BRAND_GREEN,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.confirmationPrimaryLabel,
                        {
                          color:
                            resendCooldownSeconds > 0
                              ? theme.colors.textSoft
                              : BRAND_CREAM_ON_GREEN,
                        },
                      ]}
                    >
                      {resendConfirm.isPending
                        ? 'Enviando…'
                        : resendConfirm.rateLimited
                          ? 'Reintentá en unos minutos'
                          : resendCooldownSeconds > 0
                            ? `Reenviar en ${resendCooldownSeconds}s`
                            : 'Reenviar email'}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Cambiar email"
                    accessibilityRole="button"
                    onPress={handleChangeEmail}
                    style={({ pressed }) => [
                      styles.confirmationSecondary,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text
                      style={[styles.confirmationSecondaryLabel, { color: theme.colors.text }]}
                    >
                      Cambiar email
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <Pressable
              accessibilityLabel="Crear cuenta"
              accessibilityRole="button"
              disabled={!canSubmit || isSubmitting}
              onPress={submitSignup}
              style={({ pressed }) => [
                styles.submitCta,
                {
                  backgroundColor: canSubmit
                    ? BRAND_GREEN
                    : theme.colors.surfaceMuted,
                  opacity: pressed && canSubmit ? 0.9 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.submitLabel,
                  {
                    color: canSubmit
                      ? BRAND_CREAM_ON_GREEN
                      : theme.colors.textSoft,
                  },
                ]}
              >
                {isSubmitting ? 'Creando…' : 'Crear cuenta'}
              </Text>
              {canSubmit && !isSubmitting ? (
                <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                  <Path
                    d="M5 3l5 5-5 5"
                    stroke={BRAND_CREAM_ON_GREEN}
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              ) : null}
            </Pressable>
          </FadeInUp>

          {/* Divider */}
          <FadeInUp delay={150} reduced={reduced} style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: theme.colors.line }]} />
            <Text style={[styles.dividerLabel, { color: theme.colors.textSoft }]}>O</Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.colors.line }]} />
          </FadeInUp>

          {/* Social options — secondary fallback below the form. */}
          <FadeInUp delay={200} reduced={reduced} style={styles.socialBlock}>
            <Pressable
              accessibilityLabel="Continuar con Apple"
              accessibilityRole="button"
              onPress={handleAppleSignUp}
              style={({ pressed }) => [
                styles.socialButton,
                styles.appleButton,
                { opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <AppleIcon />
              <Text style={styles.appleLabel}>Continuar con Apple</Text>
            </Pressable>

            <Pressable
              accessibilityLabel="Continuar con Google"
              accessibilityRole="button"
              onPress={handleGoogleSignUp}
              style={({ pressed }) => [
                styles.socialButton,
                styles.googleButton,
                { borderColor: theme.colors.line },
                pressed && { opacity: 0.85 },
              ]}
            >
              <GoogleIcon />
              <Text style={[styles.googleLabel, { color: theme.colors.text }]}>
                Continuar con Google
              </Text>
            </Pressable>
          </FadeInUp>

          <FadeInUp delay={300} reduced={reduced}>
            <Text style={[styles.fineprint, { color: theme.colors.textSoft }]}>
              Al crear tu cuenta aceptas los{' '}
              <Text
                accessibilityRole="link"
                onPress={() => void Linking.openURL(TERMS_OF_SERVICE_URL)}
                style={styles.fineprintLink}
              >
                Términos
              </Text>{' '}
              y la{' '}
              <Text
                accessibilityRole="link"
                onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
                style={styles.fineprintLink}
              >
                Privacidad
              </Text>
              .
            </Text>
          </FadeInUp>
        </View>
      </Screen>
      <CaptchaModal visible={captcha.visible} onComplete={captcha.onComplete} />
    </RequireGuest>
  )
}

// ─── Icons ───────────────────────────────────────────────

function AppleIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="#fff">
      <Path
        d="M11.624 8.49c-.018-1.95 1.59-2.89 1.665-2.935-.908-1.327-2.32-1.508-2.823-1.53-1.203-.12-2.348.71-2.957.71-.622 0-1.557-.69-2.56-.67-1.317.02-2.527.766-3.205 1.943-1.366 2.366-.35 5.87.98 7.79.65.94 1.422 1.995 2.435 1.957.978-.038 1.348-.633 2.532-.633 1.184 0 1.518.633 2.555.612 1.054-.02 1.722-.957 2.366-1.902.745-1.092 1.05-2.148 1.069-2.203-.024-.01-2.05-.785-2.07-3.14zm-1.95-5.762c.537-.65.898-1.554.8-2.456-.773.032-1.71.515-2.267 1.163-.5.573-.935 1.493-.818 2.378.862.067 1.748-.437 2.285-1.085z"
        fill="#fff"
      />
    </Svg>
  )
}

function GoogleIcon() {
  // Official Google "G" mark, simplified to four solid paths.
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48" fill="none">
      <Path
        d="M44.5 20H24v8.5h11.8C34.7 33.9 30 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"
        fill="#FFC107"
      />
      <Path
        d="M6.3 14.7l7 5.1C15.1 16.1 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 6.1 29.6 4 24 4c-8.4 0-15.6 4.8-19.2 11.7z"
        fill="#FF3D00"
      />
      <Path
        d="M24 46c5.4 0 10.3-2 14-5.3l-6.5-5.5C29.5 36.7 26.9 38 24 38c-5.9 0-10.9-3.7-12.8-9l-7 5.4C7.9 41.4 15.4 46 24 46z"
        fill="#4CAF50"
      />
      <Path
        d="M44.5 20H24v8.5h11.8c-.9 2.6-2.5 4.9-4.6 6.5l6.5 5.5C42.4 36.5 46 31 46 24c0-1.3-.2-2.7-.5-4z"
        fill="#1976D2"
      />
    </Svg>
  )
}

// ─── FadeInUp ───────────────────────────────────────────

interface FadeInUpProps {
  delay?: number
  duration?: number
  reduced?: boolean
  style?: object
  children: React.ReactNode
}

function FadeInUp({ delay = 0, duration = 600, reduced, style, children }: FadeInUpProps) {
  const y = useSharedValue(reduced ? 0 : 10)
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
  // Single scrollable column. Auto keyboard insets shift the WHOLE
  // surface up together when the keyboard opens — same pattern as
  // login-screen.tsx.
  screenContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 24,
    gap: 0,
  },
  topNav: {
    paddingHorizontal: 20,
    paddingTop: 8,
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
    width: 22,
  },
  body: {
    paddingHorizontal: 28,
    paddingTop: 16,
    gap: 24,
  },
  // Hero
  heroBlock: {
    gap: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1.4,
    lineHeight: 36,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
  },
  // Social
  socialBlock: {
    gap: 10,
  },
  socialButton: {
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  appleButton: {
    backgroundColor: '#000',
  },
  appleLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  googleButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  googleLabel: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
  },
  // Form
  formBlock: {
    gap: 14,
  },
  strengthRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  strengthBars: {
    flex: 1,
    height: 4,
    flexDirection: 'row',
    gap: 3,
  },
  strengthBar: {
    flex: 1,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    minWidth: 70,
    textAlign: 'right',
  },
  submitCta: {
    height: 56,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
    shadowColor: BRAND_GREEN,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 4,
  },
  submitLabel: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  // Fineprint
  fineprint: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  fineprintLink: {
    textDecorationLine: 'underline',
  },
  // Email confirmation panel
  confirmationPanel: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  confirmationTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  confirmationBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  confirmationActions: {
    marginTop: 4,
    flexDirection: 'row',
    gap: 8,
  },
  confirmationPrimary: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmationPrimaryLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  confirmationSecondary: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmationSecondaryLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
})
