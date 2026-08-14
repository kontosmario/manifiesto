// Diseño en el lenguaje del rediseño; copy vía t() (cableado i18n 2026-07-18).
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { BrotMascot } from '@/components/brot'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'
import { AuthDigitPad } from './auth-digit-pad'
import {
  AuthBackHeader,
  AuthCta,
  AuthFlexSpacer,
  AuthHomeIndicator,
  AuthLink,
  AuthScreenShell,
  AuthScrollBody,
  AuthStatusBar,
  AuthTextField,
} from './auth-kit'
import { AUTH_SPEC, type AuthMode } from './auth-spec'

/**
 * Recuperar contraseña — NO existe mockup: diseño derivado en el
 * lenguaje del rediseño, mismo proceso que 5g/5h del onboarding.
 * Espeja la pantalla REAL mobile/screens/auth/forgot-password-screen.tsx
 * (estado `form` líneas 234-293, estado `sent` líneas 150-232), cuya
 * anatomía espeja a su vez la del login por decisión del owner
 * (2026-06-11, ver el header de esa pantalla). Por eso el esqueleto de
 * acá es el del 4b: AuthBackHeader (back + logo), eyebrow → título →
 * lead, columna de campos y CTA NEUTRO — el 4b usa `neutral` para
 * "Continuar" (el verde queda reservado a "Crear cuenta" en 4a), y este
 * flujo es una rama del login, así que hereda el neutro.
 *
 * Copy literal de auth:forgotPassword.* + auth:common.backToLogin +
 * auth:login.unconfirmed.resend + auth:signup.resentInfo
 * (mobile/lib/i18n/locales/es/auth.json).
 *
 * PASE DE FUNCIONALIDAD (owner 2026-07-17): el email es un input REAL
 * (arranca vacío, con el placeholder del flujo real — la persona demo se
 * retiró, igual que en 4a/4b) con el criterio de validez transcripto de
 * la real; el CTA bloquea vía disabled + disabledHint y al tocarlo
 * bloqueado marca el campo culpable (anillo durazno) + haptic de error.
 * form↔sent transiciona con el fade estándar (key={stage}, mismo patrón
 * que las fases del PIN).
 *
 * CONTRATO LIVE (cableado 2026-07-17, patrón 4b): el demo interno de
 * éxito se retiró al preview — quién decide cada transición es el CALLER:
 *   · `stage` ('form' | 'sent') lo controla el caller (la neo screen lo
 *     deriva del resultado real de la mutation; el preview lo simula con
 *     delay) y `sentTo` es el email del copy del estado sent.
 *   · "Enviar link" emite onSubmitEmail(email) con `submitting` (CTA
 *     busy) y `serverError` como props. El caller es dueño de los
 *     hápticos de éxito/error del envío y de limpiar serverError a null
 *     al arrancar cada submit; tipear en el campo lo descarta
 *     visualmente acá adentro (render-adjust, receta 4b). El fallo se
 *     muestra con el errorRow compartido del flujo (Brot worried +
 *     durazno, receta 4b).
 *   · El código se tipea con el AuthDigitPad inline; al 6º dígito
 *     aparece el check (la real auto-submitea ahí; el rediseño aprobado
 *     confirma con el CTA) y "Ingresar con el código" emite
 *     onCodeComplete(code) — la neo screen navega a reset-password.
 *   · "Reenviar email" emite onResend, gateado por `resendCooldown`
 *     (segundos restantes; 0 = link habilitado, >0 = feedback de
 *     reenviado). El cooldown vive en el caller.
 */

/** Largo del código del mail (igual que la pantalla real: 6 dígitos). */
const CODE_LENGTH = 6

/** Celdas del código: wells hundidos CHICOS. Receta transcripta literal
 *  de las celdas del PIN (CELL, auth-pin.tsx) — mismo criterio
 *  anti-acople que el PAD de auth-digit-pad.tsx: valores locales, no
 *  del kit. El well del kit (s.wellShadow, inset 4/9) es para
 *  superficies grandes; a este tamaño ensucia. */
const CELL: Record<AuthMode, { background: string | undefined; shadow: string }> = {
  light: {
    background: undefined,
    shadow: 'inset 3px 3px 7px rgba(151,160,136,0.35), inset -3px -3px 7px rgba(255,255,255,0.9)',
  },
  dark: {
    background: '#142519',
    shadow: 'inset 3px 3px 7px rgba(0,0,0,0.5), inset -3px -3px 7px rgba(101,152,113,0.08)',
  },
}

// Texto de error del rediseño: durazno de atención, NUNCA rojo (misma
// constante que ERROR_TEXT de auth-4b-login.tsx / auth-pin.tsx).
const ERROR_TEXT: Record<AuthMode, string> = { light: '#B0764A', dark: '#F2A87E' }

export type AuthForgotStage = 'form' | 'sent'

export function AuthForgotPassword({
  mode,
  stage,
  sentTo,
  submitting = false,
  serverError = null,
  resendCooldown = 0,
  onBack,
  onSubmitEmail,
  onCodeComplete,
  onResend,
}: {
  mode: AuthMode
  /** Estado de la pantalla — lo controla el CALLER (ver header). */
  stage: AuthForgotStage
  /** Email al que salió el mail (copy resaltado del estado sent). */
  sentTo: string
  /** Envío en vuelo: CTA busy (press ignorado, visual activo). */
  submitting?: boolean
  /**
   * Error del envío (captcha o falla del server). El caller lo setea en
   * el fallo (y dispara el háptico — dueño del efecto) y lo limpia a
   * null al arrancar cada submit; tipear en el campo lo descarta
   * visualmente acá adentro (patrón 4b).
   */
  serverError?: string | null
  /** Segundos restantes del cooldown de reenvío (0 = habilitado). */
  resendCooldown?: number
  /** Back del header y "Volver a login" del estado sent. */
  onBack?: () => void
  /** Submit del form con email válido (trim; el caller normaliza). */
  onSubmitEmail?: (email: string) => void
  /** "Ingresar con el código" con el código de 6 dígitos completo. */
  onCodeComplete?: (code: string) => void
  /** "Reenviar email" (solo alcanzable con resendCooldown en 0). */
  onResend?: () => void
}) {
  const s = AUTH_SPEC[mode]
  const { t } = useTranslation()
  // Input real (pase de funcionalidad): arranca vacío con placeholder.
  // `emailError` = campo culpable de la validación bloqueante (anillo
  // durazno del kit); se limpia al tipear en el campo.
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState(false)
  // Código como STRING (los ceros a la izquierda importan — misma razón
  // por la que AuthDigitPad emite strings y no numbers).
  const [code, setCode] = useState('')
  const complete = code.length === CODE_LENGTH

  // El código pertenece a UNA pasada por `sent`: si el caller cambia el
  // stage (preview: back de sent→form; la neo screen no vuelve), el
  // próximo sent arranca limpio. Render-adjust, sin effect.
  const [lastStage, setLastStage] = useState(stage)
  if (stage !== lastStage) {
    setLastStage(stage)
    setCode('')
    setEmailError(false)
  }

  // El error del server se muestra hasta que el usuario tipea (descarta)
  // o el caller lo limpia. Render-adjust (sin effect): un serverError
  // NUEVO resetea el descarte — el caller lo pone en null al iniciar
  // cada submit, así el mismo mensaje dos veces también retriggerea.
  // (Receta transcripta de auth-4b-login.tsx.)
  const [lastServerError, setLastServerError] = useState(serverError)
  const [errorDismissed, setErrorDismissed] = useState(false)
  if (serverError !== lastServerError) {
    setLastServerError(serverError)
    setErrorDismissed(false)
  }
  const sendError = Boolean(serverError) && !errorDismissed

  // Criterio de validez transcripto de la real (handleSubmit,
  // forgot-password-screen.tsx:68-73): normalizeEmail(email) = trim +
  // lowercase (features/auth/auth-flow.ts:27-29) y el gate es
  // `normalized.includes('@')`. Transcripto local para no acoplar el
  // componente al módulo de auth — mismo criterio anti-acople que CELL.
  const normalizedEmail = email.trim().toLowerCase()
  const emailValid = normalizedEmail.includes('@')

  const handleEmailChange = useCallback((text: string) => {
    setEmail(text)
    // Tipear en el campo culpable limpia su error y descarta el del
    // server (regla del pase; ver render-adjust de arriba).
    setEmailError(false)
    setErrorDismissed(true)
  }, [])

  // Submit real: burbujea al caller (que decide el paso a `sent`). El
  // trim espeja el payload del 4b; la normalización completa la hace el
  // caller (normalizeEmail de la real). Solo alcanzable con email
  // válido: AuthCta disabled gatea el resto; busy ya ignora el press,
  // el guard es cinturón.
  const handleSend = useCallback(() => {
    if (submitting) return
    onSubmitEmail?.(email.trim())
  }, [email, onSubmitEmail, submitting])

  // Tap sobre el CTA bloqueado (onDisabledPress: el kit solo lo invoca
  // estando disabled, y con callback le cede el háptico): AuthCta muestra
  // su hint por su cuenta y acá la pantalla marca el campo culpable +
  // haptic de error.
  const handleBlockedSend = useCallback(() => {
    setEmailError(true)
    void triggerHaptic('error')
  }, [])

  const handleDigit = useCallback(
    (digit: string) => {
      if (code.length >= CODE_LENGTH) return
      const next = code + digit
      setCode(next)
      // 6º dígito: la real auto-submitea acá; el rediseño aprobado
      // celebra (háptico + check) y confirma con el CTA de abajo.
      if (next.length === CODE_LENGTH) void triggerHaptic('success')
    },
    [code],
  )

  const handleBackspace = useCallback(() => {
    setCode((prev) => prev.slice(0, -1))
  }, [])

  return (
    <AuthScreenShell mode={mode}>
      <AuthStatusBar mode={mode} />
      <AuthScrollBody gutter={22}>
        {/* Back del header: siempre burbujea al caller (la neo screen
            vuelve a login como la real; el preview decide sent→form).
            Sin háptico propio: AuthBackHeader ya dispara el 'light'. */}
        <AuthBackHeader mode={mode} onBack={onBack} />

        {/* key={stage}: remonta el bloque al pasar form↔sent para que el
            estado entrante haga el fade estándar — mismo patrón que las
            fases del PIN (auth-pin.tsx, bloque key={phase}). Una
            animación one-shot por cambio de estado, nada por frame.
            flexGrow para que los AuthFlexSpacer del form sigan
            repartiendo el aire dentro del wrapper. */}
        <Animated.View
          key={stage}
          entering={FadeInDown.duration(motionDurations.standard)}
          style={styles.stepWrap}
        >
          {stage === 'form' ? (
            <>
              {/* Norma de distribución (owner 2026-07-17): el form es corto
                  → Brot+título+lead+campo centrados entre el header y el
                  CTA (que va abajo), en vez de colapsar todo arriba. */}
              <AuthFlexSpacer />
              {/* Brot `coach` PROTAGONISTA (owner 2026-07-17: fuera del
                  costado de los textos): centrado y grande coronando el
                  bloque — es él quien te dice "Tranquilo, lo resolvemos".
                  En web no renderiza (Skia) y el bloque sigue centrado. */}
              <View style={styles.brotCoach}>
                <BrotMascot pose="coach" size={76} shadow={false} />
              </View>
              <View style={styles.titleBlock}>
                <Text style={[styles.eyebrow, { color: s.helper }]}>
                  {t('auth:forgotPassword.formEyebrow')}
                </Text>
                <Text style={[styles.title, { color: s.text }]}>
                  {t('auth:forgotPassword.formTitle')}
                </Text>
              </View>

              <Text style={[styles.lead, { color: s.textSoft }]}>
                {t('auth:forgotPassword.formSub')}
              </Text>

              {/* Label real: "Email de tu cuenta" (auth:forgotPassword.emailLabel).
                  Los labels de campo del kit van en MAYÚSCULAS (EMAIL /
                  CONTRASEÑA en 4a/4b, letterSpacing 1.84) — se transcribe el
                  string real en ese tratamiento. Input REAL del kit: foco con
                  anillo de acento, error con anillo durazno; keyboardType
                  igual que la real (email-address). */}
              <AuthTextField
                mode={mode}
                label={t('auth:redesign.accountEmailLabel')}
                value={email}
                onChangeText={handleEmailChange}
                // auth:common.emailPlaceholder (el del flujo real; la
                // persona demo se retira, igual que en 4a/4b).
                placeholder={t('auth:common.emailPlaceholder')}
                keyboardType="email-address"
                error={emailError}
                topGap={24}
              />

              <AuthFlexSpacer />
              {/* "Enviar link" (auth:forgotPassword.send). Bloqueado hasta
                  email válido; el hint del bloqueo es el copy de error REAL
                  "Ingresa un email válido."
                  (auth:forgotPassword.errorInvalidEmail) — cubre vacío y
                  malformado, igual que en la real. onDisabledPress: ver
                  handleBlockedSend. busy = envío real en vuelo. */}
              <View style={styles.ctaWrap}>
                <AuthCta
                  mode={mode}
                  variant="neutral"
                  label={t('auth:forgotPassword.send')}
                  disabled={!emailValid}
                  disabledHint={t('auth:forgotPassword.errorInvalidEmail')}
                  onPress={handleSend}
                  onDisabledPress={handleBlockedSend}
                  busy={submitting}
                />
              </View>

              {/* Fallo del envío (captcha / server): errorRow compartido
                  del flujo — receta de auth-4b-login.tsx (Brot worried 34 +
                  texto durazno, FadeInDown). El texto viene del caller
                  (serverError); cae donde caería el hint del CTA. */}
              {sendError ? (
                <Animated.View
                  entering={FadeInDown.duration(motionDurations.standard)}
                  style={styles.errorRow}
                >
                  <BrotMascot pose="worried" size={34} shadow={false} />
                  <Text style={[styles.errorText, { color: ERROR_TEXT[mode] }]}>{serverError}</Text>
                </Animated.View>
              ) : null}
            </>
          ) : (
            <>
              <View style={styles.titleBlock}>
                <Text style={[styles.eyebrow, { color: s.helper }]}>
                  {t('auth:forgotPassword.sentEyebrow')}
                </Text>
                <Text style={[styles.title, { color: s.text }]}>
                  {t('auth:forgotPassword.sentTitle')}
                </Text>
              </View>

              {/* sentBodyPrefix + email destino (prop `sentTo`: el caller
                  pasa el email NORMALIZADO al que salió el envío real,
                  como el sentTo de la real; resaltado como su subStrong)
                  + sentBodySuffix. */}
              <Text style={[styles.body, { color: s.textSoft }]}>
                {t('auth:forgotPassword.sentBodyPrefix')}{' '}
                <Text style={[styles.bodyStrong, { color: s.text }]}>{sentTo}</Text>{' '}
                {t('auth:forgotPassword.sentBodySuffix')}
              </Text>

              {/* Brot narra el tramo del código: `think` mientras el código
                  está pendiente (momento informativo, sub-protagonista junto
                  al label — está "pensando" el código del mail) y pasa a
                  `cheer` al completarse (micro-momento emocional: recuperar
                  el acceso quedó a un tap). Un solo Brot en pantalla; en
                  fila con el label flexible, no es load-bearing del layout. */}
              <View style={styles.codeLabelRow}>
                <BrotMascot pose={complete ? 'cheer' : 'think'} size={40} shadow={false} />
                <Text style={[styles.codeLabel, { color: s.helper }]}>
                  {t('auth:forgotPassword.codeLabel')}
                </Text>
              </View>

              <View style={styles.cellsRow}>
                {Array.from({ length: CODE_LENGTH }, (_, i) => (
                  <CodeCell
                    key={i}
                    mode={mode}
                    char={code[i] ?? ''}
                    // Celda activa = la próxima a tipear (ninguna al completar).
                    active={i === code.length && !complete}
                  />
                ))}
              </View>

              {complete ? (
                // Código completo: check + confirmación. "Código completo" no
                // tiene key en auth.json (la real auto-submitea sin mostrar
                // texto) — copy mínimo del rediseño.
                <Animated.View
                  entering={FadeInDown.duration(motionDurations.standard)}
                  style={styles.successRow}
                >
                  <View style={[styles.successCheck, { backgroundColor: s.linkAccent }]}>
                    <CheckIcon color={s.ctaGreenText} />
                  </View>
                  <Text style={[styles.successText, { color: s.text }]}>
                    {t('auth:forgotPassword.codeComplete')}
                  </Text>
                </Animated.View>
              ) : resendCooldown > 0 ? (
                // Feedback del reenvío (auth:signup.resentInfo): visible
                // mientras corre el cooldown del caller; al llegar a 0
                // vuelve el link.
                <Text style={[styles.resentInfo, { color: s.helper }]}>
                  {t('auth:signup.resentInfo')}
                </Text>
              ) : (
                // Reenviar (auth:login.unconfirmed.resend). La real no lo
                // tiene en esta vista — pedido del rediseño; el cooldown
                // vive en el caller (resendCooldown). Sin háptico propio:
                // AuthLink ya dispara el 'light' en el kit.
                <AuthLink
                  mode={mode}
                  tone="soft"
                  underline
                  onPress={onResend}
                  style={styles.resendLink}
                >
                  {t('auth:login.unconfirmed.resend')}
                </AuthLink>
              )}

              {/* Pad inline del rediseño (reemplaza al InAppNumpad de la
                  real). Con el código completo los dígitos quedan inertes
                  y atenuados (digitsDisabled); backspace sigue vivo para
                  corregir. */}
              <View style={styles.padWrap}>
                <AuthDigitPad
                  mode={mode}
                  onDigit={handleDigit}
                  onBackspace={handleBackspace}
                  digitsDisabled={complete}
                />
              </View>

              {/* Quién decide el éxito es el CALLER: el CTA emite el código
                  completo (onCodeComplete) y la neo screen navega a
                  reset-password con email+otp, como el submitCode real. */}
              <View style={styles.ctaWrap}>
                <AuthCta
                  mode={mode}
                  variant="neutral"
                  label={t('auth:forgotPassword.enterWithCode')}
                  disabled={!complete}
                  // Sin key en auth.json (la real deshabilita sin hint) —
                  // copy mínimo del rediseño, patrón OnbCta/AuthCta.
                  disabledHint={t('auth:forgotPassword.codeMissingHint')}
                  onPress={() => onCodeComplete?.(code)}
                />
              </View>

              {/* Secundario silencioso (el ghost "Volver a login" de la
                  real) — en el lenguaje del rediseño es el link muted, como
                  el "Ahora no" del 4c. */}
              <AuthLink mode={mode} tone="muted" onPress={onBack} style={styles.backToLogin}>
                {t('auth:common.backToLogin')}
              </AuthLink>
            </>
          )}
        </Animated.View>
      </AuthScrollBody>
      <AuthHomeIndicator mode={mode} />
    </AuthScreenShell>
  )
}

// ─── Celda de código hundida (well chico + anillo de acento) ─────────
//
// Receta del anillo = OnbActiveRing (onb-kit.tsx) transcripta local para
// no acoplar los turnos: borde 2.5 en el verde de acento del spec
// (s.linkAccent — mismo ACCENT que usan 5g/5h) que aparece/desaparece
// con un withTiming de opacidad. One-shot al cambiar de celda: cero
// trabajo por frame.

function CodeCell({ mode, char, active }: { mode: AuthMode; char: string; active: boolean }) {
  const s = AUTH_SPEC[mode]
  const cell = CELL[mode]
  const visible = useSharedValue(active ? 1 : 0)
  useEffect(() => {
    visible.value = withTiming(active ? 1 : 0, { duration: motionDurations.quick })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
  const ringStyle = useAnimatedStyle(() => ({ opacity: visible.value }))
  return (
    <View style={[styles.cell, { backgroundColor: cell.background, boxShadow: cell.shadow }]}>
      {char ? <Text style={[styles.cellDigit, { color: s.text }]}>{char}</Text> : null}
      <Animated.View
        pointerEvents="none"
        style={[styles.cellRing, ringStyle, { borderColor: s.linkAccent }]}
      />
    </View>
  )
}

// ─── Check del éxito (no hay uno en auth-icons; trazo local) ─────────

function CheckIcon({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <Path
        d="M2.5 7.5l3 3 6-7"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

// ─── Estilos (métricas del 4b donde son compartidas; el resto propio) ─

const styles = StyleSheet.create({
  // Wrapper del estado (key={stage}): flexGrow para que los spacers del
  // form repartan el aire adentro; con contenido alto (sent + pad) no
  // cambia nada, el scroll manda.
  stepWrap: { flexGrow: 1 },
  // Brot coach protagonista coronando el bloque centrado del form.
  brotCoach: { alignItems: 'center' },
  // Eyebrow + título centrados, métricas del 4b (eyebrow 14/800,
  // título 34/900).
  titleBlock: { alignItems: 'center', marginTop: 12 },
  eyebrow: { fontSize: 14, fontWeight: '800', fontFamily: nunitoFamily('800') },
  title: {
    fontSize: 34,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    lineHeight: 38,
    marginTop: 4,
    textAlign: 'center',
  },
  // Lead centrado bajo el título (Brot dejó de vivir a su costado).
  lead: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: 8,
  },
  body: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 14,
  },
  bodyStrong: { fontWeight: '900', fontFamily: nunitoFamily('900') },
  // Fila Brot + label del código (sent).
  codeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
  },
  codeLabel: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    lineHeight: 17,
  },
  cellsRow: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 12,
  },
  // Well hundido chico: receta de celda chica (CELL, arriba — la de
  // auth-pin.tsx), NO el inset del AuthWell del kit, en geometría de celda.
  cell: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellDigit: {
    fontSize: 24,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  cellRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 2.5,
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  successCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successText: { fontSize: 13, fontWeight: '900', fontFamily: nunitoFamily('900') },
  resendLink: { marginTop: 14 },
  resentInfo: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    textAlign: 'center',
    marginTop: 14,
  },
  padWrap: { marginTop: 18 },
  ctaWrap: { marginTop: 20 },
  backToLogin: { marginTop: 16 },
  // Receta del errorRow/errorText de auth-4b-login.tsx (a su vez la del
  // auth-pin.tsx), con el marginTop del ctaHintRow del kit (12) para
  // caer donde caería el hint.
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
})
