// Panel "Revisa tu correo" post-signup — copy vía t() (auth:signup.confirmation.*).
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { BrotMascot } from '@/components/brot'
import { motionDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'
import {
  AuthBackHeader,
  AuthCta,
  AuthFlexSpacer,
  AuthHomeIndicator,
  AuthLink,
  AuthMedallion,
  AuthScreenShell,
  AuthScrollBody,
  AuthStatusBar,
} from './auth-kit'
import { AUTH_SPEC, type AuthMode } from './auth-spec'

/**
 * Panel "Revisa tu correo" post-signup (confirmación por email).
 *
 * GAP DE DISEÑO: no existe mockup para este estado — el design doc salta
 * de 4a (Crear cuenta) a 4c (Face ID) porque en el flujo feliz Supabase
 * devuelve sesión inmediata. Diseñado con el vocabulario del kit (norma
 * de distribución vertical: header arriba, hero respirando al centro,
 * acciones abajo — referencia 4c). Hero = AuthMedallion (el medallón
 * durazno del kit); sin Brot en el hero — la mascota aparece solo en las
 * filas de feedback (cheer para info, worried para error, misma receta
 * que el errorRow de 4a).
 *
 * Contenido espejo del panel real (signup-screen.tsx §confirmationPanel):
 * título + email enmascarado, instrucciones, reenviar con cooldown
 * visible en el label del CTA, y el link anti-dead-end a login (si el
 * email ya estaba registrado, Supabase no manda mail por anti-
 * enumeración y el usuario quedaría esperando; el copy del body es
 * condicional a propósito). "Cambiar email" del panel real se mapea al
 * back circular del header: volver = editar el formulario.
 *
 * Presentacional puro: la pantalla (neo-signup-screen) es dueña del
 * estado del reenvío (useResendConfirmEmail) y de los hápticos de
 * resultado; el kit pone los de press.
 */

// Texto de error del rediseño: durazno de atención, NUNCA rojo (misma
// constante que ERROR_TEXT de auth-4a-crear-cuenta.tsx / auth-pin.tsx).
const ERROR_TEXT: Record<AuthMode, string> = { light: '#B0764A', dark: '#F2A87E' }

export function AuthConfirmEmailPanel({
  mode,
  email,
  infoMessage = null,
  errorMessage = null,
  cooldownSeconds = 0,
  resending = false,
  rateLimited = false,
  onResend,
  onChangeEmail,
  onLogin,
}: {
  mode: AuthMode
  /** Email destino, YA enmascarado por el caller (maskEmail). */
  email: string
  /** Confirmación de reenvío u otra info (fila Brot cheer). */
  infoMessage?: string | null
  /** Error de reenvío (fila Brot worried + durazno). Pisa a infoMessage. */
  errorMessage?: string | null
  /** Segundos hasta poder reenviar (0 = listo). Visible en el CTA. */
  cooldownSeconds?: number
  /** Reenvío en vuelo: CTA busy (visual activo, press ignorado). */
  resending?: boolean
  /** Rate limit local agotado (3 envíos / 5 min): CTA bloqueado. */
  rateLimited?: boolean
  onResend?: () => void
  /** Back del header: volver al formulario a editar el email. */
  onChangeEmail?: () => void
  /** Anti-dead-end: ir a login. */
  onLogin?: () => void
}) {
  const { t } = useTranslation()
  const s = AUTH_SPEC[mode]

  // Labels reales del panel de la pantalla real, en su misma precedencia
  // (sending > rateLimited > cooldown > resend).
  const resendLabel = resending
    ? t('auth:signup.confirmation.sending')
    : rateLimited
      ? t('auth:signup.confirmation.rateLimited')
      : cooldownSeconds > 0
        ? t('auth:signup.confirmation.cooldown', { seconds: cooldownSeconds })
        : t('auth:signup.confirmation.resend')

  return (
    <AuthScreenShell mode={mode}>
      <AuthStatusBar mode={mode} />
      <AuthScrollBody gutter={22}>
        <AuthBackHeader mode={mode} onBack={onChangeEmail} />

        <AuthFlexSpacer />

        <View style={styles.hero}>
          <AuthMedallion mode={mode} />
          {/* auth:signup.confirmation.titleShort — el título real
              ("Te mandamos un mail a {{email}}") se parte en título +
              línea de email para darle jerarquía; esta key es la mitad
              sin el email (que va aparte, abajo). */}
          <Text style={[styles.title, { color: s.text }]}>
            {t('auth:signup.confirmation.titleShort')}
          </Text>
          <Text style={[styles.email, { color: s.text }]}>{email}</Text>
          {/* auth:signup.confirmation.body */}
          <Text style={[styles.body, { color: s.helper }]}>
            {t('auth:signup.confirmation.body')}
          </Text>
        </View>

        <AuthFlexSpacer />

        <AuthCta
          mode={mode}
          variant="green"
          label={resendLabel}
          onPress={onResend}
          disabled={cooldownSeconds > 0 || rateLimited}
          busy={resending}
        />

        {/* Feedback bajo el CTA — receta del errorRow de 4a (error pisa
            info, igual que los pills de la pantalla real). */}
        {errorMessage ? (
          <Animated.View
            entering={FadeInDown.duration(motionDurations.standard)}
            style={styles.feedbackRow}
          >
            <BrotMascot pose="worried" size={34} shadow={false} />
            <Text style={[styles.feedbackText, { color: ERROR_TEXT[mode] }]}>{errorMessage}</Text>
          </Animated.View>
        ) : infoMessage ? (
          <Animated.View
            entering={FadeInDown.duration(motionDurations.standard)}
            style={styles.feedbackRow}
          >
            <BrotMascot pose="cheer" size={34} shadow={false} />
            <Text style={[styles.feedbackText, { color: s.textSoft }]}>{infoMessage}</Text>
          </Animated.View>
        ) : null}

        {/* auth:signup.confirmation.loginLink */}
        <AuthLink mode={mode} tone="accent" onPress={onLogin} style={styles.loginLink}>
          {t('auth:signup.confirmation.loginLink')}
        </AuthLink>
      </AuthScrollBody>
      <AuthHomeIndicator mode={mode} />
    </AuthScreenShell>
  )
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingHorizontal: 6 },
  // Tipografía del hero centrado de 4c (32/900 + sub 14.5/700).
  title: {
    fontSize: 32,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    marginTop: 28,
    textAlign: 'center',
  },
  email: {
    fontSize: 17,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    marginTop: 10,
    textAlign: 'center',
  },
  body: {
    fontSize: 14.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 21,
    marginTop: 12,
    textAlign: 'center',
  },
  // Misma receta que el errorRow de 4a / ctaHintRow del kit.
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  feedbackText: {
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    lineHeight: 17,
    textAlign: 'center',
  },
  // Aire del skipLink de 4c.
  loginLink: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    marginTop: 18,
  },
})
