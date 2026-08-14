// Réplica del design doc (4b/4bo); copy vía t() (cableado i18n 2026-07-18).
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import type { TextInput as RNTextInput } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { BrotMascot } from '@/components/brot'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'
import {
  AuthBackHeader,
  AuthCta,
  AuthDivider,
  AuthHomeIndicator,
  AuthLink,
  AuthMedallion,
  AuthPasswordField,
  AuthScreenShell,
  AuthScrollBody,
  AuthSocialButton,
  AuthStatusBar,
  AuthTextField,
} from './auth-kit'
import { AUTH_SPEC, type AuthMode } from './auth-spec'

/**
 * 4b · Login "¡Hola de vuelta!" — réplica de screens/4b.html (claro) y
 * 4bo.html (oscuro). Vista first-time del login: eyebrow + título,
 * medallón durazno con el logo, email + contraseña, CTA neutro
 * "Continuar", dos links y los sociales.
 *
 * DESVÍO DEL MOCKUP (decisión owner 2026-07-16): los sociales van en
 * COLUMNA full-width (mismo componente que crear cuenta), no en la
 * fila lado a lado que dibuja 4b.
 *
 * DESVÍO DEL MOCKUP (decisión owner 2026-07-17): SIN Brot en el hero.
 * El mockup dibuja un `wave` al costado del título; se probó también
 * `laugh` asomando detrás del medallón, y el owner retiró ambos — el
 * título queda limpio y el medallón solo con el logo. (El `worried` del
 * failure state de credenciales sí queda: es el vocabulario de error
 * compartido del flujo, no una integración del hero.)
 *
 * PASE DE FUNCIONALIDAD (owner 2026-07-17): la vista dejó de ser demo
 * estática — inputs reales con foco/error, validación bloqueante en el
 * CTA y failure state de credenciales. Los valores demo del mockup
 * pasaron a alcanzarse tipeando; los campos arrancan vacíos con los
 * placeholders del login real.
 *
 * Es la vista `password-form`/`change-account` de la app real. Las
 * otras 3 vistas del login (returning con avatar, face-id,
 * secondary-only) NO tienen mockup y se derivan aparte (Fase 3).
 *
 * No entra en pantalla → AuthScrollBody.
 */

// Texto de error del rediseño: durazno de atención, NUNCA rojo (misma
// constante que ERROR_TEXT de auth-pin.tsx).
const ERROR_TEXT: Record<AuthMode, string> = { light: '#B0764A', dark: '#F2A87E' }

export function Auth4bLogin({
  mode,
  onBack,
  onContinue,
  onForgot,
  onResend,
  onApple,
  onGoogle,
  appleAvailable = true,
  googleAvailable = true,
  submitting = false,
  serverError = null,
  infoText = null,
  autoFocusEmail = false,
}: {
  mode: AuthMode
  onBack?: () => void
  /** Submit con el CTA habilitado: el caller dispara el login real. */
  onContinue?: (payload: { email: string; password: string }) => void
  onForgot?: () => void
  /**
   * Link "¿No te llegó el email de confirmación?" — lleva el email
   * TIPEADO en el form (review r1: el caller no ve el estado interno; sin
   * payload reenviaba al email cacheado de otra cuenta o a ninguno).
   */
  onResend?: (payload: { email: string }) => void
  onApple?: () => void
  onGoogle?: () => void
  /** Gating real de sociales (Apple se oculta en Android). */
  appleAvailable?: boolean
  googleAvailable?: boolean
  /** Login en vuelo: CTA busy (press ignorado, visual activo). */
  submitting?: boolean
  /**
   * Autofocus del campo email al montar (review r1: la pantalla vieja
   * enfocaba al elegir "Cambiar cuenta"; el default false preserva la
   * entrada sin teclado del first-time y del preview).
   */
  autoFocusEmail?: boolean
  /**
   * Mensaje informativo del caller (p. ej. "Reenviamos el email de
   * confirmación."): texto sobrio en helper bajo el CTA. El error tiene
   * prioridad si ambos llegan.
   */
  infoText?: string | null
  /**
   * Error del server (anti-enumeración: SIEMPRE el genérico "Email o
   * contraseña incorrectos.", nunca cuál campo falló). El caller lo
   * setea en el fallo (y dispara el háptico 'error' — dueño del efecto)
   * y lo limpia a null al arrancar un submit nuevo; tipear en cualquier
   * campo lo descarta visualmente acá adentro.
   */
  serverError?: string | null
}) {
  const s = AUTH_SPEC[mode]
  const { t } = useTranslation()
  const [revealed, setRevealed] = useState(false)

  // El error del server se muestra hasta que el usuario tipea (descarta)
  // o el caller lo limpia. Render-adjust (sin effect): un serverError
  // NUEVO resetea el descarte — el caller lo pone en null al iniciar
  // cada submit, así el mismo mensaje dos veces también retriggerea.
  const [lastServerError, setLastServerError] = useState(serverError)
  const [errorDismissed, setErrorDismissed] = useState(false)
  if (serverError !== lastServerError) {
    setLastServerError(serverError)
    setErrorDismissed(false)
  }
  const credentialError = Boolean(serverError) && !errorDismissed

  // Formulario: arranca VACÍO con placeholder (los valores demo del
  // mockup ya no vienen precargados).
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Culpables de la validación bloqueante: se marcan (anillo durazno) al
  // tocar el CTA deshabilitado y se limpian al tipear en ese campo.
  const [emailBlocked, setEmailBlocked] = useState(false)
  const [passwordBlocked, setPasswordBlocked] = useState(false)

  // Misma regla de email que el flujo real (auth-flow.ts:88 y
  // login-screen.tsx:373): con tener un '@' alcanza para intentar.
  const emailValid = email.trim().includes('@')
  const passwordFilled = password.length > 0
  const ctaDisabled = !emailValid || !passwordFilled

  // Hint dinámico del CTA bloqueado: el PRIMERO que falte, con el string
  // literal de la validación real.
  const disabledHint = !emailValid
    ? t('auth:validation.invalidEmail')
    : t('auth:validation.emptyPassword')

  const handleEmailChange = (text: string) => {
    setEmail(text)
    // Tipear en el campo limpia su marca de culpable y el error genérico.
    if (emailBlocked) setEmailBlocked(false)
    if (credentialError) setErrorDismissed(true)
  }

  const handlePasswordChange = (text: string) => {
    setPassword(text)
    if (passwordBlocked) setPasswordBlocked(false)
    if (credentialError) setErrorDismissed(true)
  }

  // Toque sobre el CTA bloqueado (onDisabledPress: el kit solo lo invoca
  // estando disabled, y con callback le cede el háptico): el kit muestra
  // el disabledHint y acá la pantalla suma lo que el kit no puede saber —
  // marcar el/los campos culpables + háptico de error.
  const handleBlockedPress = () => {
    if (!emailValid) setEmailBlocked(true)
    if (!passwordFilled) setPasswordBlocked(true)
    void triggerHaptic('error')
  }

  const handleContinue = () => {
    if (submitting) return
    onContinue?.({ email: email.trim(), password })
  }

  // Cadena de foco next→password (la de la pantalla vieja, refs internos).
  const passwordRef = useRef<RNTextInput>(null)

  return (
    <AuthScreenShell mode={mode}>
      <AuthStatusBar mode={mode} />
      <AuthScrollBody gutter={22}>
        <AuthBackHeader mode={mode} onBack={onBack} />

        {/* Título limpio y centrado — el Brot `wave` que el mockup dibuja
            a su costado se retiró (desvío owner 2026-07-17, ver header). */}
        <View style={styles.titleBlock}>
          <Text style={[styles.eyebrow, { color: s.helper }]}>{t('auth:login.firstTimeEyebrow')}</Text>
          {/* i18n pendiente: auth:login.firstTimeTitle trae "👋" (el wave del mockup viejo); el
              rediseño retiró ese gesto (ver header), así que el título queda literal sin emoji. */}
          <Text style={[styles.title, { color: s.text }]}>{t('auth:redesign.loginReturnTitle')}</Text>
        </View>

        <View style={styles.medallionWrap}>
          <AuthMedallion mode={mode} />
        </View>

        <Text style={[styles.lead, { color: s.textSoft }]}>{t('auth:login.firstTimeSub')}</Text>

        <AuthTextField
          mode={mode}
          // Mayúsculas = estilo del kit (fieldLabel sin textTransform); la copy es login.emailLabel.
          label={t('auth:login.emailLabel').toUpperCase()}
          value={email}
          onChangeText={handleEmailChange}
          placeholder={t('auth:common.emailPlaceholder')}
          keyboardType="email-address"
          error={emailBlocked || credentialError}
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          autoFocus={autoFocusEmail}
        />
        <AuthPasswordField
          mode={mode}
          label={t('auth:login.passwordLabel').toUpperCase()}
          value={password}
          onChangeText={handlePasswordChange}
          placeholder={t('auth:common.passwordPlaceholder')}
          revealed={revealed}
          onToggleReveal={() => setRevealed((v) => !v)}
          error={passwordBlocked || credentialError}
          textContentType="password"
          autoComplete="password"
          returnKeyType="go"
          onSubmitEditing={() => {
            if (!ctaDisabled) handleContinue()
          }}
          inputRef={passwordRef}
        />

        <View style={styles.ctaWrap}>
          <AuthCta
            mode={mode}
            variant="neutral"
            label={t('auth:login.continue')}
            onPress={handleContinue}
            disabled={ctaDisabled}
            disabledHint={disabledHint}
            onDisabledPress={handleBlockedPress}
            busy={submitting}
          />
        </View>

        {/* Failure state de credenciales: receta del errorRow de
            auth-pin.tsx (Brot worried 34 + texto durazno, FadeInDown).
            El texto viene del caller (serverError) — anti-enumeración:
            el flujo real siempre manda el genérico
            auth:errors.genericSignIn ("Email o contraseña incorrectos."). */}
        {credentialError ? (
          <Animated.View
            entering={FadeInDown.duration(motionDurations.standard)}
            style={styles.errorRow}
          >
            <BrotMascot pose="worried" size={34} shadow={false} />
            <Text style={[styles.errorText, { color: ERROR_TEXT[mode] }]}>{serverError}</Text>
          </Animated.View>
        ) : infoText ? (
          // Info del caller (reenvío de confirmación, cooldown): texto
          // sobrio en helper, misma posición que el error.
          <Animated.View
            entering={FadeInDown.duration(motionDurations.standard)}
            style={styles.errorRow}
          >
            <Text style={[styles.errorText, { color: s.helper }]}>{infoText}</Text>
          </Animated.View>
        ) : null}

        <AuthLink mode={mode} tone="soft" onPress={onForgot} style={styles.forgotLink}>
          {t('auth:login.forgotPasswordQuestion')}
        </AuthLink>
        <AuthLink
          mode={mode}
          tone="soft"
          underline
          onPress={() => onResend?.({ email: email.trim() })}
          style={styles.resendLink}
        >
          {t('auth:login.confirmResendQuestion')}
        </AuthLink>

        {/* Sociales en columna full-width (decisión owner 2026-07-16:
            mismos botones que crear cuenta; la fila del mockup 4b se
            retiró). Gating real: Apple no existe en Android; si no queda
            ningún social, el divisor tampoco se dibuja. */}
        {appleAvailable || googleAvailable ? <AuthDivider mode={mode} topGap={14} /> : null}
        {appleAvailable ? (
          <View style={styles.appleWrap}>
            <AuthSocialButton mode={mode} provider="apple" onPress={onApple} />
          </View>
        ) : null}
        {googleAvailable ? (
          <View style={styles.googleWrap}>
            <AuthSocialButton mode={mode} provider="google" onPress={onGoogle} />
          </View>
        ) : null}
      </AuthScrollBody>
      <AuthHomeIndicator mode={mode} />
    </AuthScreenShell>
  )
}

const styles = StyleSheet.create({
  titleBlock: { alignItems: 'center', marginTop: 16 },
  medallionWrap: { marginTop: 22 },
  eyebrow: { fontSize: 14, fontWeight: '800', fontFamily: nunitoFamily('800') },
  title: {
    fontSize: 34,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    // Headroom sobre el fontSize: en iOS la baseline queda a
    // `lineHeight − descent` del tope y las mayúsculas de Nunito 900 suben
    // 0.705em, así que con `lineHeight == fontSize` el título salía rebanado.
    lineHeight: 34 * 1.2,
    marginTop: 4,
  },
  lead: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    marginTop: 20,
  },
  ctaWrap: { marginTop: 18 },
  // Receta del errorRow/statusText de auth-pin.tsx, con el marginTop del
  // ctaHintRow del kit (12) para caer donde caería el hint.
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  errorText: {
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    lineHeight: 17,
    textAlign: 'center',
  },
  forgotLink: { marginTop: 16 },
  resendLink: { marginTop: 10 },
  appleWrap: { marginTop: 12 },
  googleWrap: { marginTop: 12 },
})
