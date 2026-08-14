// Réplica del design doc (4a/4ao); copy vía t() (cableado i18n 2026-07-18).
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import type { TextInput as RNTextInput } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { BrotMascot } from '@/components/brot'
import { triggerHaptic } from '@/lib/haptics'
import i18n from '@/lib/i18n'
import { motionDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'
import {
  AuthBackHeader,
  AuthCta,
  AuthDivider,
  AuthHomeIndicator,
  AuthLegal,
  AuthPasswordField,
  AuthScreenShell,
  AuthScrollBody,
  AuthSocialButton,
  AuthStatusBar,
  AuthStrengthMeter,
  AuthTextField,
} from './auth-kit'
import { AUTH_SPEC, type AuthMode } from './auth-spec'

/**
 * 4a · Crear cuenta — réplica de screens/4a.html (claro) y 4ao.html
 * (oscuro), FUNCIONAL desde el pase del owner (2026-07-17): los campos
 * arrancan vacíos con placeholder, los inputs son reales (foco con
 * anillo de acento, error con anillo durazno), el medidor de fuerza
 * está vivo y el CTA valida bloqueante con el patrón disabledHint del
 * kit. El estado "lleno" del mockup se alcanza tipeando.
 *
 * DESVÍO DEL MOCKUP (decisión owner 2026-07-16): los sociales van
 * IGUALES a los del login (fila Apple/Google de 4b), no los apilados
 * "Continuar con…" que dibuja 4a. De paso retira el bug de 4ao (el
 * Google apilado oscuro traía la sombra del tema claro — halo blanco).
 *
 * No entra en pantalla → AuthScrollBody.
 */

// ─── Validación transcripta de la pantalla real ──────────────────────
//
// Transcripción LOCAL a propósito: password-policy.ts arrastra i18n al
// bundle de esta réplica dev-only, así que se copian las reglas acá con
// los strings literales de auth.json (key citada en cada mensaje).

/** Real: submitSignup (signup-screen.tsx) valida `trimmedName.length < 2`. */
function nombreValido(nombre: string): boolean {
  return nombre.trim().length >= 2
}

/**
 * Real: normalizeEmail (features/auth/auth-flow.ts) = trim + lowercase,
 * y submitSignup valida `normalizedEmail.includes('@')`.
 */
function emailValido(email: string): boolean {
  return email.trim().toLowerCase().includes('@')
}

/**
 * checkPasswordPolicy (features/auth/password-policy.ts) transcripto:
 * mínimo 10, máximo 72 (límite efectivo de bcrypt), rechaza
 * todo-dígitos / todo-letras. Devuelve el mensaje de error REAL o null
 * si pasa. La blocklist de ~30 contraseñas comunes del validador real
 * NO se transcribe — es peso muerto en el preview; la pone el cableado
 * live cuando esta pantalla use el módulo real.
 */
function passwordPolicyError(password: string): string | null {
  if (password.length < 10) {
    return i18n.t('auth:passwordPolicy.tooShort', { min: 10 })
  }
  if (password.length > 72) {
    return i18n.t('auth:passwordPolicy.tooLong', { max: 72 })
  }
  if (/^\d+$/.test(password) || /^[A-Za-z]+$/.test(password)) {
    return i18n.t('auth:passwordPolicy.mixLettersNumbers')
  }
  return null
}

/**
 * Medidor de fuerza transcripto de signup-screen.tsx (`strength`):
 * 0 vacía · 1 corta (<10 = PASSWORD_POLICY.MIN_LENGTH) · 2 <14 · 3 resto.
 */
function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  if (password.length === 0) return 0
  if (password.length < 10) return 1
  if (password.length < 14) return 2
  return 3
}

// Texto de error del rediseño: durazno de atención, NUNCA rojo (misma
// constante que ERROR_TEXT de auth-pin.tsx / auth-4b-login.tsx).
const ERROR_TEXT: Record<AuthMode, string> = { light: '#B0764A', dark: '#F2A87E' }

export function Auth4aCrearCuenta({
  mode,
  onBack,
  onCreate,
  onApple,
  onGoogle,
  onTerms,
  onPrivacy,
  submitting = false,
  serverError = null,
  appleAvailable = true,
  googleAvailable = true,
}: {
  mode: AuthMode
  onBack?: () => void
  /** Submit con el CTA habilitado: el caller dispara el signup real. */
  onCreate?: (payload: { name: string; email: string; password: string }) => void
  onApple?: () => void
  onGoogle?: () => void
  onTerms?: () => void
  onPrivacy?: () => void
  /** Signup en vuelo: CTA busy (press ignorado, visual activo). */
  submitting?: boolean
  /**
   * Error del server del alta (el caller lo mapea a copy user-facing, es
   * dueño del háptico 'error' y lo limpia a null al arrancar cada
   * submit). Tipear en cualquier campo lo descarta visualmente.
   */
  serverError?: string | null
  /**
   * Apple no se ofrece donde el SO no lo soporta (Android /
   * isAppleSignInAvailable=false): oculta el botón y Google hereda el
   * marginTop del primer social (14). Default true = réplica intacta.
   */
  appleAvailable?: boolean
  /**
   * Google con kill-switch apagado / env sin configurar se OCULTA (la
   * pantalla vieja gateaba con isGoogleSignInConfigured — review r1).
   * Sin ningún social tampoco se dibuja el divisor.
   */
  googleAvailable?: boolean
}) {
  const s = AUTH_SPEC[mode]
  const { t } = useTranslation()
  // Labels reales: auth:signup.strengthWeak / strengthGood / strengthStrong.
  // Índice 0 = contraseña vacía: sin label (la real oculta el medidor).
  const STRENGTH_LABELS = ['', t('auth:signup.strengthWeak'), t('auth:signup.strengthGood'), t('auth:signup.strengthStrong')] as const
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [revealed, setRevealed] = useState(false)

  // Error del server con descarte por tipeo — mismo patrón render-adjust
  // que auth-4b-login.tsx (un serverError NUEVO resetea el descarte).
  const [lastServerError, setLastServerError] = useState(serverError)
  const [errorDismissed, setErrorDismissed] = useState(false)
  if (serverError !== lastServerError) {
    setLastServerError(serverError)
    setErrorDismissed(false)
  }
  const serverErrorVisible = Boolean(serverError) && !errorDismissed
  // Campos culpables tras tocar el CTA bloqueado (anillo durazno). Se
  // limpian al tipear en el campo aunque siga inválido: el anillo es
  // feedback del intento fallido, no un validador vivo — mismo criterio
  // que la pantalla real (errorField se resetea en cada onChangeText).
  const [errores, setErrores] = useState({ nombre: false, email: false, password: false })

  const nombreOk = nombreValido(nombre)
  const emailOk = emailValido(email)
  // La real valida la política sobre password.trim() (submitSignup).
  const passwordError = passwordPolicyError(password.trim())
  const formValido = nombreOk && emailOk && passwordError === null

  // Hint del CTA bloqueado: PRIMER faltante en orden de lectura del
  // formulario, con los mensajes de error reales de la pantalla real.
  const disabledHint = !nombreOk
    ? t('auth:signup.errorAddName')
    : !emailOk
      ? t('auth:signup.errorInvalidEmail')
      : (passwordError ?? undefined)

  const strength = passwordStrength(password)

  // Cadena de foco nombre→email→contraseña→submit (la de la pantalla
  // vieja, refs internos) + submit compartido CTA/tecla "go".
  const emailRef = useRef<RNTextInput>(null)
  const passwordRef = useRef<RNTextInput>(null)
  const handleCreate = () => {
    if (submitting) return
    onCreate?.({ name: nombre.trim(), email: email.trim(), password: password.trim() })
  }

  return (
    <AuthScreenShell mode={mode}>
      <AuthStatusBar mode={mode} />
      <AuthScrollBody gutter={22}>
        <AuthBackHeader mode={mode} onBack={onBack} />

        <Text style={[styles.title, { color: s.text }]}>{t('auth:signup.title')}</Text>
        <Text style={[styles.sub, { color: s.helper }]}>{t('auth:signup.subtitle')}</Text>

        <AuthTextField
          mode={mode}
          // Mayúsculas = estilo del kit (fieldLabel sin textTransform); la copy es signup.nameLabel.
          label={t('auth:signup.nameLabel').toUpperCase()}
          value={nombre}
          onChangeText={(v) => {
            setNombre(v)
            if (errores.nombre) setErrores((e) => ({ ...e, nombre: false }))
            if (serverErrorVisible) setErrorDismissed(true)
          }}
          // El demo "Marcos" del mockup se retira.
          placeholder={t('auth:signup.namePlaceholder')}
          autoCapitalize="words"
          error={errores.nombre}
          topGap={18}
          textContentType="givenName"
          autoComplete="name"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
        <AuthTextField
          mode={mode}
          label={t('auth:signup.emailLabel').toUpperCase()}
          value={email}
          onChangeText={(v) => {
            setEmail(v)
            if (errores.email) setErrores((e) => ({ ...e, email: false }))
            if (serverErrorVisible) setErrorDismissed(true)
          }}
          // El demo "marcos@manifiestoapp.com" se retira.
          placeholder={t('auth:common.emailPlaceholder')}
          keyboardType="email-address"
          error={errores.email}
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          inputRef={emailRef}
        />
        <AuthPasswordField
          mode={mode}
          label={t('auth:signup.passwordLabel').toUpperCase()}
          value={password}
          onChangeText={(v) => {
            setPassword(v)
            if (errores.password) setErrores((e) => ({ ...e, password: false }))
            if (serverErrorVisible) setErrorDismissed(true)
          }}
          placeholder={t('auth:common.passwordPlaceholder')}
          revealed={revealed}
          onToggleReveal={() => setRevealed((v) => !v)}
          error={errores.password}
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="go"
          onSubmitEditing={() => {
            if (formValido) handleCreate()
          }}
          inputRef={passwordRef}
        />

        <Text style={[styles.hint, { color: s.passwordHint }]}>{t('auth:signup.passwordHelper')}</Text>
        {/* Medidor VIVO (antes fijo en 2/"Buena"). Siempre montado: con
            la contraseña vacía queda en 0 barras y sin label, y no hay
            salto de layout al tipear la primera letra (mismo criterio
            que la real, que lo mantiene montado con opacity 0). */}
        <AuthStrengthMeter mode={mode} filled={strength} label={STRENGTH_LABELS[strength]} />

        {/* AuthCta maneja el press bloqueado adentro (Brot think + hint
            durazno) y expone ese tap como onDisabledPress; la pantalla
            suma lo suyo: marcar los campos culpables con anillo durazno
            + háptico de error (con callback, el kit le cede el háptico). */}
        <View style={styles.ctaWrap}>
          <AuthCta
            mode={mode}
            variant="green"
            // Chevron "  ›" decorativo; la copy traducible es signup.create.
            label={`${t('auth:signup.create')}  ›`}
            onPress={handleCreate}
            disabled={!formValido}
            disabledHint={disabledHint}
            onDisabledPress={() => {
              void triggerHaptic('error')
              setErrores({
                nombre: !nombreOk,
                email: !emailOk,
                password: passwordError !== null,
              })
            }}
            busy={submitting}
          />
        </View>

        {/* Error del server bajo el CTA: misma receta del errorRow de 4b
            (Brot worried 34 + texto durazno, FadeInDown). */}
        {serverErrorVisible ? (
          <Animated.View
            entering={FadeInDown.duration(motionDurations.standard)}
            style={styles.errorRow}
          >
            <BrotMascot pose="worried" size={34} shadow={false} />
            <Text style={[styles.errorText, { color: ERROR_TEXT[mode] }]}>{serverError}</Text>
          </Animated.View>
        ) : null}

        {appleAvailable || googleAvailable ? <AuthDivider mode={mode} /> : null}

        {/* Sociales en columna full-width, idénticos a los del login
            (decisión owner: mismo componente en las dos pantallas).
            Sin Apple (Android), Google pasa a ser el primer social y
            toma el marginTop 14 del apilado. */}
        {appleAvailable ? (
          <View style={styles.appleWrap}>
            <AuthSocialButton mode={mode} provider="apple" onPress={onApple} />
          </View>
        ) : null}
        {googleAvailable ? (
          <View style={appleAvailable ? styles.googleWrap : styles.appleWrap}>
            <AuthSocialButton mode={mode} provider="google" onPress={onGoogle} />
          </View>
        ) : null}

        <View style={styles.legalWrap}>
          {/* i18n pendiente: AuthLegal (kit) hardcodea " los Términos y la Privacidad." y la key
              auth:signup.fineprintPrefix trae " los" (duplicaría). Prefix literal hasta reconciliar el kit. */}
          <AuthLegal
            mode={mode}
            prefix={t('auth:redesign.signupFineprint')}
            size={11}
            onTerms={onTerms}
            onPrivacy={onPrivacy}
          />
        </View>
      </AuthScrollBody>
      <AuthHomeIndicator mode={mode} />
    </AuthScreenShell>
  )
}

const styles = StyleSheet.create({
  title: {
    fontSize: 33,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    marginTop: 20,
  },
  sub: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 21,
    marginTop: 6,
  },
  hint: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginTop: 9,
  },
  ctaWrap: { marginTop: 20 },
  // Receta del errorRow de 4b (aire 12 del ctaHintRow del kit).
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
  // Ritmo vertical del apilado del mockup 4a (14 el primero, 12 entre).
  appleWrap: { marginTop: 14 },
  googleWrap: { marginTop: 12 },
  legalWrap: { marginTop: 16 },
})
