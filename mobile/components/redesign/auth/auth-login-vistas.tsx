// Réplica en el lenguaje del rediseño; copy vía t() (cableado i18n 2026-07-18).
// El label uppercase "CONTRASEÑA" usa auth:redesign.passwordLabel (mayúsculas
// por diseño; la key auth:login.passwordLabel del flujo viejo va en title case).
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, { FadeInDown } from 'react-native-reanimated'
import type { AvatarSlug } from '@/assets/avatars'
import { BrotMascot } from '@/components/brot'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'
import {
  AuthBackHeader,
  AuthCta,
  AuthDivider,
  AuthFlexSpacer,
  AuthHomeIndicator,
  AuthLink,
  AuthPasswordField,
  AuthScreenShell,
  AuthScrollBody,
  AuthSecondaryButton,
  AuthSocialButton,
  AuthStatusBar,
} from './auth-kit'
import { AUTH_SPEC, type AuthMode } from './auth-spec'
import { FaceIdIcon, FingerprintIcon } from './auth-icons'
import type { BiometricSensor } from './auth-4c-faceid'

/**
 * Login · vistas `returning` / `face-id` / `secondary-only` — Turno 4,
 * Fase 3. NO EXISTE MOCKUP para estas vistas: el design doc solo cubre
 * el login first-time (4b/4bo = password-form/change-account, ya
 * replicado en auth-4b-login.tsx). Se diseñan acá en el MISMO lenguaje
 * de 4b, espejando lo que la pantalla REAL renderiza en cada vista:
 *
 *   · Pantalla real: mobile/screens/auth/login-screen.tsx
 *       — hero returning (saludo + avatar animal):  líneas 543–595
 *       — bloque face-id (CTA + secundarios):        líneas 713–791
 *       — bloque secondary-only (sin biometría):     líneas 792–828
 *   · Resolución de vistas: mobile/features/auth/login-action-view.ts:32
 *     (resolveLoginActionView → password-form | face-id | secondary-only;
 *     password-form ya está cubierta por auth-4b-login.tsx).
 *
 * Derivación del lenguaje: hero de 4b (eyebrow + título + Brot +
 * medallón durazno) pero con el AVATAR ANIMAL del usuario adentro del
 * medallón en vez del logo de marca — "tu cuenta" en vez de "la marca".
 * CTA y links reusan los patrones de 4b y 4c (auth-kit). Copy literal
 * de mobile/lib/i18n/locales/es/auth.json (login.*, greetings.*) con
 * los valores demo interpolados a mano.
 *
 * Estado DEMO local (useState), cero llamadas reales, cero navegación —
 * el caller pasa callbacks. Bajo gate de aprobación del owner.
 *
 * PASE DE FUNCIONALIDAD (owner 2026-07-17): la vista `returning` dejó de
 * ser display estático — contraseña como input real (arranca vacía con
 * placeholder), CTA bloqueante con hint + anillo durazno al tocarlo, y
 * failure state demo con la credencial demo (idéntico al de 4b). face-id
 * suma el happy path del demo (éxito tras el escaneo → onContinue).
 */

export type AuthLoginVista = 'returning' | 'face-id' | 'secondary-only'

// ─── Constantes propias de la pantalla (patrón PEDESTAL de 5c) ────────

/**
 * Saludo default del pool real: auth:greetings.neutral[2] ("Hola de
 * nuevo"). El flujo real sortea uno por mount y franja horaria
 * (pickReturningGreeting, mobile/lib/copy/auth-greetings.ts) y lo pasa
 * por prop; el default fijo mantiene la aprobación reproducible en el
 * preview.
 */
const GREETING_DEFAULT = 'Hola de nuevo'

/** Identidad demo del preview (la real llega por props del caller). */
const NAME_DEMO = 'Marcos'
const AVATAR_DEMO: AvatarSlug = 'macaw'
const EMAIL_DEMO = 'marcos@manifiestoapp.com'

/**
 * Medallón del hero: MISMA geometría y tratamiento durazno que el
 * AuthMedallion de 4b (124×124, radio 62, fallback #E08A5E, gradiente y
 * sombra del spec). El kit hardcodea el FernLogo adentro y no se puede
 * tocar (réplica aprobada) — esta pantalla lo redibuja local para meter
 * el avatar del usuario.
 */
const MEDALLION_SIZE = 124
const MEDALLION_FALLBACK = '#E08A5E'

/**
 * Silueta del avatar en crema de marca sobre el durazno — mismo rol que
 * CREAM sobre PEACH en el login real (login-screen.tsx:573). 88dp deja
 * el glifo en ~63dp (ratio 0.72 interno de AvatarAnimal), el mismo peso
 * visual que el FernLogo de 64 que 4b mete en este medallón.
 */
const AVATAR_TINT = '#F5F2E1'
const AVATAR_SIZE = 88

/**
 * Brot `peek` DETRÁS del medallón, diminuto (feedback owner 2026-07-17:
 * por delante y grande se sentía raro). 34 de alto, con solo ~20dp de
 * cabeza asomando sobre el borde — el resto queda tapado por el círculo
 * (se renderiza ANTES del medallón en el árbol). Su animación de
 * agacharse lo esconde del todo por momentos.
 */
const BROT_PEEK_SIZE = 34
/** Alto visible de la cabeza por encima del borde del círculo. */
const BROT_PEEK_VISIBLE = 20

/**
 * Texto de error en el durazno de atención del rediseño (NUNCA rojo) —
 * mismo ERROR_TEXT que auth-pin.tsx.
 */
const ERROR_TEXT: Record<AuthMode, string> = { light: '#B0764A', dark: '#F2A87E' }

export function AuthLoginVistas({
  mode,
  view,
  greeting = GREETING_DEFAULT,
  name = NAME_DEMO,
  email = EMAIL_DEMO,
  avatar = AVATAR_DEMO,
  biometricLabel = 'Face ID',
  sensor = 'face',
  scanning = false,
  submitting = false,
  serverError = null,
  onBack,
  onContinue,
  onBiometric,
  onForgot,
  onResend,
  onApple,
  onGoogle,
  appleAvailable = true,
  googleAvailable = true,
  infoText = null,
  autoFocusPassword = false,
  onUsePassword,
  onChangeAccount,
  onChooseAnotherMethod,
}: {
  mode: AuthMode
  view: AuthLoginVista
  /** Saludo sorteado por el caller (pickReturningGreeting del flujo real). */
  greeting?: string
  /** Identidad cacheada del último usuario (perfil real por props). */
  name?: string
  /** Email cacheado; fallback del caller: auth:login.savedAccountFallback. */
  email?: string
  avatar?: AvatarSlug
  /** Label del sensor real ("Face ID", "huella digital", …) para el CTA. */
  biometricLabel?: string
  /**
   * Sensor principal del device (auditoría 2026-08-21): elige el glifo
   * del bloque biométrico — huella en Android con lector (aunque el
   * hardware también reporte face-unlock débil), cara en Face ID.
   * Default 'face' = el render histórico de la vista.
   */
  sensor?: BiometricSensor
  /** Prompt biométrico en vuelo (label "Reconociendo" + CTA busy). */
  scanning?: boolean
  /** Login con contraseña en vuelo (returning): CTA busy. */
  submitting?: boolean
  /**
   * Error del server del submit returning (anti-enumeración: el caller
   * manda SIEMPRE el genérico auth:errors.genericSignIn y es dueño del
   * háptico 'error'; lo limpia a null al arrancar cada submit). Tipear
   * lo descarta visualmente acá adentro.
   */
  serverError?: string | null
  onBack?: () => void
  /** Submit del form returning con el CTA habilitado. */
  onContinue?: (payload: { password: string }) => void
  /** Press del CTA biométrico: el caller corre el prompt real. */
  onBiometric?: () => void
  onForgot?: () => void
  onResend?: () => void
  onApple?: () => void
  onGoogle?: () => void
  /** Gating real de sociales (Apple se oculta en Android). */
  appleAvailable?: boolean
  googleAvailable?: boolean
  /** Mensaje informativo bajo el CTA (prioridad: error > info). */
  infoText?: string | null
  /**
   * Autofocus del campo contraseña al montar la vista returning (review
   * r1: la pantalla vieja enfocaba al elegir "Usar contraseña" y en el
   * fallback de Face ID; default false = preview intacto).
   */
  autoFocusPassword?: boolean
  onUsePassword?: () => void
  onChangeAccount?: () => void
  /** Salida del form returning (auth:login.chooseAnotherMethod). */
  onChooseAnotherMethod?: () => void
}) {
  const { t } = useTranslation()
  const s = AUTH_SPEC[mode]
  const [revealed, setRevealed] = useState(false)

  // ── Estado del form returning (pase de funcionalidad) ──────────────
  // Contraseña real: arranca VACÍA. Estado local simple: cada tecla
  // re-renderiza solo esta pantalla.
  const [password, setPassword] = useState('')
  // Campo culpable de una validación → anillo durazno persistente.
  const [passwordError, setPasswordError] = useState(false)

  // Error del server con descarte por tipeo — mismo patrón render-adjust
  // que auth-4b-login.tsx (un serverError NUEVO resetea el descarte; el
  // caller lo pone en null al iniciar cada submit).
  const [lastServerError, setLastServerError] = useState(serverError)
  const [errorDismissed, setErrorDismissed] = useState(false)
  if (serverError !== lastServerError) {
    setLastServerError(serverError)
    setErrorDismissed(false)
  }
  const signInError = Boolean(serverError) && !errorDismissed

  const handleFaceId = () => {
    // Cinturón: AuthCta ya ignora el press con busy — este guard cubre
    // cualquier invocación fuera del CTA. El caller corre el prompt
    // biométrico real y es dueño de sus hápticos (la pantalla real los
    // dispara ella misma, login-screen.tsx:271).
    if (scanning) return
    onBiometric?.()
  }

  // ── Handlers del form returning ─────────────────────────────────────

  const handlePasswordChange = (text: string) => {
    setPassword(text)
    // Tipear en el campo culpable limpia ambos errores (regla del pase).
    if (passwordError) setPasswordError(false)
    if (signInError) setErrorDismissed(true)
  }

  /**
   * Tap sobre el CTA BLOQUEADO (onDisabledPress: el kit solo lo invoca
   * estando disabled, y con callback le cede el háptico): AuthCta muestra
   * el disabledHint por su cuenta (patrón aprobado del onboarding); la
   * pantalla suma el anillo durazno en el campo culpable + haptic de
   * error.
   */
  const handleBlockedPress = () => {
    setPasswordError(true)
    void triggerHaptic('error')
  }

  const handleContinue = () => {
    if (submitting) return
    onContinue?.({ password })
  }

  const continueDisabled = password.length === 0

  return (
    <AuthScreenShell mode={mode}>
      <AuthStatusBar mode={mode} />
      <AuthScrollBody gutter={22}>
        <AuthBackHeader mode={mode} onBack={onBack} />

        {/* Vistas cortas (face-id / secondary-only): el hero y sus
            acciones forman UN grupo centrado entre el header y los
            sociales — el aire va AFUERA del grupo, nunca entre la
            identidad y sus botones (feedback owner 2026-07-17: las
            islas separadas se leían desalineadas). En returning el
            contenido llena la pantalla y fluye natural. */}
        {view !== 'returning' ? <AuthFlexSpacer /> : null}

        {/* ── Hero returning (compartido por las 3 vistas) ─────────── */}
        <View style={styles.titleBlock}>
          <Text style={[styles.eyebrow, { color: s.helper }]}>{greeting}</Text>
          {/* auth:login.greetingTitle = "Hola, {{name}}". */}
          <Text style={[styles.title, { color: s.text }]}>
            {t('auth:login.greetingTitle', { name })}
          </Text>
        </View>

        {/* Medallón durazno de 4b con el avatar animal del usuario
            adentro (en vez del logo de marca). El login real muestra el
            avatar cacheado del último usuario (login-screen.tsx:570).
            Brot PROTAGONISTA (owner 2026-07-17: fuera del costado del
            título): asoma por el borde superior del medallón con la
            pose `peek` — la pose existe para esto ("asomarse a cards",
            handoff-README). Su animación lo hace agacharse y quedar
            oculto detrás del avatar por momentos (el viewBox de peek
            recorta el cuerpo a propósito — ver PAD_BOTTOM en
            brot-mascot.tsx). En web no renderiza (Skia): es absoluto,
            no mueve el layout. */}
        <View style={styles.medallionWrap}>
          <View>
            {/* Brot ANTES del medallón en el árbol → queda DETRÁS: solo
                la cabecita asoma por el borde superior. */}
            <View pointerEvents="none" style={styles.brotPeek}>
              <BrotMascot pose="peek" size={BROT_PEEK_SIZE} shadow={false} />
            </View>
            <View
              style={[
                styles.medallion,
                {
                  experimental_backgroundImage: s.medallionCss,
                  backgroundColor: MEDALLION_FALLBACK,
                  boxShadow: s.medallionShadow,
                },
              ]}
            >
              <AvatarAnimal
                slug={avatar}
                size={AVATAR_SIZE}
                tint={AVATAR_TINT}
                backgroundTint="transparent"
              />
            </View>
          </View>
        </View>

        {/* Email cacheado bajo el avatar (emailMicro,
            login-screen.tsx:586-593) — el identificador de cuenta del
            hero, presente en las 3 vistas. */}
        <Text style={[styles.emailMicro, { color: s.textSoft }]} numberOfLines={1}>
          {email}
        </Text>

        {view === 'returning' ? (
          <>
            {/* La app real NO renderiza el campo EMAIL en use-password:
                el email cacheado va explícito en el hero (emailMicro) y
                el form es solo contraseña (login-screen.tsx:912). El
                aire sobre el campo lo aporta el micro — topGap default.
                INPUT REAL: arranca vacío; placeholder literal del campo
                real (auth:common.passwordPlaceholder, "••••••••",
                login-screen.tsx:933). */}
            <AuthPasswordField
              mode={mode}
              // MISMATCH: auth:login.passwordLabel = "Contraseña" (title case),
              // pero el diseño pide el label en MAYÚSCULAS. Sin resolver → literal.
              label={t('auth:redesign.passwordLabel')}
              value={password}
              onChangeText={handlePasswordChange}
              // auth:common.passwordPlaceholder = "••••••••"
              placeholder={t('auth:common.passwordPlaceholder')}
              revealed={revealed}
              onToggleReveal={() => setRevealed((v) => !v)}
              error={passwordError || signInError}
              textContentType="password"
              autoComplete="password"
              returnKeyType="go"
              onSubmitEditing={() => {
                if (!continueDisabled) handleContinue()
              }}
              autoFocus={autoFocusPassword}
            />

            <View style={styles.ctaWrap}>
              {/* auth:login.continue — mismo CTA neutro que 4b. Hint del
                  bloqueado: auth:validation.emptyPassword ("Ingresa tu
                  contraseña."), el copy real de auth-flow.ts:107 para
                  contraseña vacía. onDisabledPress: ver handleBlockedPress. */}
              <AuthCta
                mode={mode}
                variant="neutral"
                // auth:login.continue
                label={t('auth:login.continue')}
                onPress={handleContinue}
                disabled={continueDisabled}
                // auth:validation.emptyPassword
                disabledHint={t('auth:validation.emptyPassword')}
                onDisabledPress={handleBlockedPress}
                busy={submitting}
              />
            </View>

            <FeedbackRow
              mode={mode}
              error={signInError ? serverError : null}
              info={infoText}
            />

            {/* auth:login.forgotPasswordQuestion / confirmResendQuestion
                — mismos links y aires que 4b. */}
            <AuthLink mode={mode} tone="soft" onPress={onForgot} style={styles.forgotLink}>
              {t('auth:login.forgotPasswordQuestion')}
            </AuthLink>
            <AuthLink mode={mode} tone="soft" underline onPress={onResend} style={styles.resendLink}>
              {t('auth:login.confirmResendQuestion')}
            </AuthLink>

            {appleAvailable || googleAvailable ? <AuthDivider mode={mode} topGap={14} /> : null}

            <SocialColumn
              mode={mode}
              onApple={onApple}
              onGoogle={onGoogle}
              appleAvailable={appleAvailable}
              googleAvailable={googleAvailable}
            />

            {/* auth:login.chooseAnotherMethod ("Volver · elegir otro
                método") — el link real del password-form returning:
                PasswordForm onCancel → handleCancelForm
                (login-screen.tsx:969-978), que vuelve a la vista de
                métodos. En tono muted (rol del "Ahora no" de 4c). */}
            <AuthLink
              mode={mode}
              tone="muted"
              onPress={onChooseAnotherMethod}
              style={styles.changeAccountLink}
            >
              {t('auth:login.chooseAnotherMethod')}
            </AuthLink>
          </>
        ) : null}

        {view === 'face-id' ? (
          <>
            {/* CTA + salidas pegados al hero (mismo grupo): el spacer de
                arriba del título y el de antes del divisor centran el
                conjunto completo. */}
            {/* Glifo del sensor REAL sobre el CTA (pedido owner
                2026-08-21): en un Android solo-huella el bloque decía
                "Entrar con huella digital" sin ningún ícono — y peor,
                el naming histórico de la vista ('face-id') sugería cara.
                Mismo par de glifos que la réplica 4c (auth-icons). */}
            <View style={styles.sensorIconWrap}>
              {sensor === 'fingerprint' ? (
                <FingerprintIcon color={s.faceIcon} size={44} />
              ) : (
                <FaceIdIcon color={s.faceIcon} size={44} />
              )}
            </View>
            <View style={styles.faceCtaWrap}>
              {/* Swap de label idle↔escaneando, literal del flujo real
                  (ctaLabel, login-screen.tsx:483): "Entrar con {{label}}"
                  (auth:login.signInWith interpolado con "Face ID") ↔
                  "Reconociendo" (auth:login.scanning). busy: el press
                  durante el escaneo se ignora en silencio, sin pasar por
                  el estado disabled del CTA — "escaneando" no es
                  "apagado". */}
              <AuthCta
                mode={mode}
                variant="neutral"
                // auth:login.signInWith interpolado con el label del
                // sensor real (biometricLabel) ↔ auth:login.scanning.
                label={
                  scanning
                    ? t('auth:login.scanning')
                    : t('auth:login.signInWith', { label: biometricLabel })
                }
                onPress={handleFaceId}
                busy={scanning}
              />
            </View>

            {/* Feedback bajo el CTA (review r1): lockout biométrico,
                sesión vencida, fallos sociales — la pantalla vieja los
                mostraba acá con FeedbackPill. */}
            <FeedbackRow mode={mode} error={serverError} info={infoText} />

            {/* Pila de links del lenguaje 4c (accent + muted): las dos
                salidas del bloque face-id real (login-screen.tsx:743).
                auth:login.usePassword / auth:login.changeAccount. */}
            <AuthLink
              mode={mode}
              tone="accent"
              onPress={onUsePassword}
              style={styles.usePasswordLink}
            >
              {t('auth:login.usePassword')}
            </AuthLink>
            <AuthLink
              mode={mode}
              tone="muted"
              onPress={onChangeAccount}
              style={styles.changeAccountLink}
            >
              {t('auth:login.changeAccount')}
            </AuthLink>

            <AuthFlexSpacer />
            {appleAvailable || googleAvailable ? <AuthDivider mode={mode} topGap={22} /> : null}

            <SocialColumn
              mode={mode}
              onApple={onApple}
              onGoogle={onGoogle}
              appleAvailable={appleAvailable}
              googleAvailable={googleAvailable}
            />
          </>
        ) : null}

        {view === 'secondary-only' ? (
          <>
            {/* Perfil cacheado pero sin biometría guardada: la app real
                muestra SOLO los dos secundarios + sociales, sin form ni
                CTA (login-screen.tsx:792). Acá van como fila de hundidos
                del kit (el "Ya tengo cuenta" de 3a), mitad y mitad como
                el secondaryRow real — pegados al hero (mismo grupo). */}
            <View style={styles.secondaryRow}>
              <View style={styles.secondaryHalf}>
                <AuthSecondaryButton
                  mode={mode}
                  label={t('auth:login.usePassword')}
                  onPress={onUsePassword}
                />
              </View>
              <View style={styles.secondaryHalf}>
                <AuthSecondaryButton
                  mode={mode}
                  label={t('auth:login.changeAccount')}
                  onPress={onChangeAccount}
                />
              </View>
            </View>

            {/* Feedback bajo los secundarios (review r1: fallos sociales
                / mensajes del controller también llegan a esta vista). */}
            <FeedbackRow mode={mode} error={serverError} info={infoText} />

            <AuthFlexSpacer />
            {appleAvailable || googleAvailable ? <AuthDivider mode={mode} topGap={22} /> : null}

            <SocialColumn
              mode={mode}
              onApple={onApple}
              onGoogle={onGoogle}
              appleAvailable={appleAvailable}
              googleAvailable={googleAvailable}
            />
          </>
        ) : null}
      </AuthScrollBody>
      <AuthHomeIndicator mode={mode} />
    </AuthScreenShell>
  )
}

// ─── Fila de feedback bajo el CTA (receta errorRow del PIN/4b) ────────
//
// Compartida por las 3 vistas (review r1: face-id y secondary-only no
// tenían superficie — errores biométricos/sociales quedaban mudos; la
// pantalla vieja los mostraba con FeedbackPill en esas vistas). Error
// (Brot worried + durazno) pisa a info (texto sobrio en helper).

function FeedbackRow({
  mode,
  error,
  info,
}: {
  mode: AuthMode
  error?: string | null
  info?: string | null
}) {
  const s = AUTH_SPEC[mode]
  if (error) {
    return (
      <Animated.View
        entering={FadeInDown.duration(motionDurations.standard)}
        style={styles.errorRow}
      >
        {/* Brot `worried` chico (34dp, misma receta que el error del
            PIN): acompaña el fallo con preocupación, no con reto. */}
        <BrotMascot pose="worried" size={34} shadow={false} />
        <Text style={[styles.errorText, { color: ERROR_TEXT[mode] }]}>{error}</Text>
      </Animated.View>
    )
  }
  if (info) {
    return (
      <Animated.View
        entering={FadeInDown.duration(motionDurations.standard)}
        style={styles.errorRow}
      >
        <Text style={[styles.errorText, { color: s.helper }]}>{info}</Text>
      </Animated.View>
    )
  }
  return null
}

// ─── Sociales en columna full-width (decisión owner 2026-07-16, igual
//     que 4a/4b) — las 3 vistas del login real ofrecen Apple + Google. ─

function SocialColumn({
  mode,
  onApple,
  onGoogle,
  appleAvailable = true,
  googleAvailable = true,
}: {
  mode: AuthMode
  onApple?: () => void
  onGoogle?: () => void
  appleAvailable?: boolean
  googleAvailable?: boolean
}) {
  return (
    <>
      {appleAvailable ? (
        <View style={styles.socialWrap}>
          <AuthSocialButton mode={mode} provider="apple" onPress={onApple} />
        </View>
      ) : null}
      {googleAvailable ? (
        <View style={styles.socialWrap}>
          <AuthSocialButton mode={mode} provider="google" onPress={onGoogle} />
        </View>
      ) : null}
    </>
  )
}

// ─── Estilos (aires literales tomados de 4b y 4c; ver comentarios) ────

const styles = StyleSheet.create({
  // Hero: geometría del titleBlock de 4b (auth-4b-login.tsx). El título
  // va limpio y centrado (Brot ya no vive a su costado).
  titleBlock: { alignItems: 'center', marginTop: 16 },
  eyebrow: { fontSize: 14, fontWeight: '800', fontFamily: nunitoFamily('800') },
  title: {
    fontSize: 34,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    // Headroom sobre el fontSize: el título lleva el NOMBRE del usuario, y en
    // iOS la baseline queda a `lineHeight − descent` del tope — con
    // `lineHeight == fontSize` una mayúscula (0.705em) o una tilde salían
    // rebanadas arriba.
    lineHeight: 34 * 1.2,
    marginTop: 4,
  },
  // 36 (antes 22): la cabecita de Brot asoma ~20dp sobre el medallón y
  // necesita ese aire para no pisar el título.
  medallionWrap: { alignItems: 'center', marginTop: 36 },
  // Box de peek DETRÁS del círculo: solo asoman los ~20dp de cabeza
  // (BROT_PEEK_VISIBLE); el resto del box queda tapado por el medallón.
  brotPeek: {
    position: 'absolute',
    top: -BROT_PEEK_VISIBLE,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  medallion: {
    width: MEDALLION_SIZE,
    height: MEDALLION_SIZE,
    borderRadius: MEDALLION_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Email cacheado bajo el medallión (emailMicro del login real,
  // login-screen.tsx:586-593).
  emailMicro: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    marginTop: 14,
  },
  // returning — mismos aires que 4b (CTA 18, forgot 16, resend 10).
  ctaWrap: { marginTop: 18 },
  // Fila de error bajo el CTA: receta del errorRow/statusText del PIN
  // (auth-pin.tsx) con el aire 12 del ctaHintRow del kit.
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
  // Link inferior del slot de salida (returning "Volver · elegir otro
  // método" y face-id "Cambiar cuenta") — tratamiento aprobado de 4c:
  // 14/800, compartido para que ambas vistas rindan igual.
  changeAccountLink: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    marginTop: 18,
  },
  // face-id — pila de 4c: CTA a 34 del hero, link accent 15/900 a 24 y
  // muted 14/800 a 18 (auth-4c-faceid.tsx).
  faceCtaWrap: { marginTop: 18 },
  // 34 era el respiro total del bloque face-id; con el glifo arriba se
  // reparte 16 (hero→ícono) + 18 (ícono→CTA) para conservar el ritmo.
  sensorIconWrap: { alignItems: 'center', marginTop: 16 },
  usePasswordLink: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    marginTop: 24,
  },
  // secondary-only — fila 50/50 con el gap 12 estándar del rediseño.
  secondaryRow: { flexDirection: 'row', gap: 12, marginTop: 30 },
  secondaryHalf: { flex: 1 },
  // Sociales — aire 12 entre botones, igual que 4b.
  socialWrap: { marginTop: 12 },
})
