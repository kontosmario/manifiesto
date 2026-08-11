import { useCallback, useEffect, useState } from 'react'
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { BrotMascot } from '@/components/brot'
import { FernLogo } from '@/components/auth/fern-logo'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'
import { AuthDigitPad } from './auth-digit-pad'
import {
  AuthBackHeader,
  AuthFlexSpacer,
  AuthHomeIndicator,
  AuthLink,
  AuthScreenShell,
  AuthStatusBar,
} from './auth-kit'
import { AUTH_SPEC, type AuthMode } from './auth-spec'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * PIN · setup + lock — NO existe mockup. Diseño en el lenguaje
 * neumórfico del rediseño (mismo patrón que 5g/5h del onboarding),
 * espejando las dos pantallas reales del flujo actual. CABLEADA LIVE
 * (2026-07-17): el estado demo interno se retiró — la lógica real la
 * inyecta el caller (screens live) y el preview la simula en su host,
 * mismo pase de contrato que 4b (submitting/serverError).
 *
 *  · variant 'setup' → espejo de PinSetupScreen
 *    (mobile/screens/auth/pin-setup-screen.tsx:43): fases enter →
 *    confirm, selector de largo 4/6, rechazo de PIN débil ANTES de
 *    confirmar (validateEntry, inyectado — el caller pasa isWeakPin +
 *    copy real), mismatch → error + vuelta a enter, éxito → onDone(pin)
 *    (el caller corre setPin async, es dueño del háptico de éxito y su
 *    fallo vuelve por serverError).
 *  · variant 'lock' → espejo de PinLockPanel
 *    (mobile/components/auth/pin-lock-panel.tsx:25): celdas + pad; el
 *    verify es ASYNC y EXTERNO (onSubmit/checking/errorToken); el error
 *    se comunica con shake + háptico (el flujo real NO tiene copy de
 *    "PIN incorrecto" — no se inventa); lockout por deadline
 *    (lockedUntilMs) con countdown que revive el pad al expirar
 *    (schedule real: exponencial 30s→8m, mobile/lib/pin-lock.ts:141).
 *
 * Copy literal de mobile/lib/i18n/locales/es/auth.json (pinSetup.* /
 * pinLock.*), con las interpolaciones hechas a mano; el copy de los
 * errores inyectados (PIN débil / fallo de guardado) viaja por props
 * desde el caller.
 */

/** Largos expuestos en el selector — espejo de LENGTH_OPTIONS del real
 *  (pin-setup-screen.tsx:32): 4/6, los dos formatos que la gente
 *  reconoce; el engine acepta 4–8 pero el picker no muestra 5/7/8. */
const LENGTH_OPTIONS = [4, 6] as const

// ─── Valores visuales propios de la pantalla (literales, patrón PEDESTAL) ──

/** Celdas del PIN: wells hundidos CHICOS con el punto lleno en s.text.
 *  Receta de sombra = chip idle hundido del onboarding (ONB_SURFACES,
 *  onb-spec.ts) transcripta literal para no acoplar los turnos (mismo
 *  criterio que el PAD de auth-digit-pad.tsx). El well de input del kit
 *  (inset 4/9) es para superficies grandes; a este tamaño ensucia. */
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

/** Chips del selector de largo (4/6): hundido idle ↔ elegido con anillo.
 *  Receta visual de los chips del onboarding (ONB_SURFACES, onb-spec.ts)
 *  transcripta literal; texto idle = helper del AUTH_SPEC. */
interface ChipTheme {
  idleBackground: string | undefined
  idleShadow: string
  idleText: string
  selectedBackground: string
  selectedShadow: string
  selectedText: string
}
const CHIP: Record<AuthMode, ChipTheme> = {
  light: {
    idleBackground: undefined,
    idleShadow:
      'inset 3px 3px 7px rgba(151,160,136,0.35), inset -3px -3px 7px rgba(255,255,255,0.9)',
    idleText: '#54644F',
    selectedBackground: '#DCEBD8',
    selectedShadow: 'inset 2px 2px 5px rgba(90,110,70,0.18), 0 0 0 2.5px #2E7C39',
    selectedText: '#1F5429',
  },
  dark: {
    idleBackground: '#142519',
    idleShadow: 'inset 3px 3px 7px rgba(0,0,0,0.5), inset -3px -3px 7px rgba(101,152,113,0.08)',
    idleText: '#93A78F',
    selectedBackground: 'rgba(164,227,166,0.15)',
    selectedShadow: 'inset 2px 2px 5px rgba(0,0,0,0.4), 0 0 0 2.5px #A4E3A6',
    selectedText: '#A4E3A6',
  },
}

/** Texto de error/lockout: durazno de "atención" del rediseño — el mismo
 *  del hint del CTA deshabilitado (CTA_DISABLED, auth-kit.tsx) y del
 *  label del medidor de fuerza. El rediseño NO usa rojo. */
const ERROR_TEXT: Record<AuthMode, string> = { light: '#B0764A', dark: '#F2A87E' }

// ─── Contrato ────────────────────────────────────────────────────────

interface AuthPinBaseProps {
  mode: AuthMode
  /** Back del header. En el lock LIVE no existe (se está bloqueado hasta
   *  acertar o ir por contraseña): sin onBack la fila muestra solo el
   *  logo centrado — el círculo del preview es navegación dev. */
  onBack?: () => void
}

export interface AuthPinSetupProps extends AuthPinBaseProps {
  variant: 'setup'
  /** Validación del PIN recién ingresado (fase enter completa) ANTES de
   *  pedir confirmación: devuelve el copy de error a mostrar, o null si
   *  pasa. El caller live pasa isWeakPin + copy real; sin prop, no se
   *  valida (el preview inyecta su réplica local). */
  validateEntry?: (pin: string) => string | null
  /** Confirmación OK (ambos ingresos coinciden): el caller corre el
   *  guardado real (setPin, async) y es dueño del háptico de éxito. */
  onDone?: (pin: string) => void
  /** Guardado en vuelo: input, selector y cancelar quedan inertes en
   *  silencio (visual activo — patrón busy de AuthCta). */
  saving?: boolean
  /** Error del guardado (setPin rechazó: WeakPinError defense-in-depth /
   *  storage). Patrón serverError de 4b (render-adjust): un valor nuevo
   *  no-null muestra el mensaje y resetea a la fase enter; el caller lo
   *  limpia a null al arrancar cada intento (así el mismo mensaje dos
   *  veces retriggerea) y es dueño del háptico de error. */
  serverError?: string | null
}

export interface AuthPinLockProps extends AuthPinBaseProps {
  variant: 'lock'
  /** Largo REAL del PIN guardado (getPinLength) — el caller NO monta el
   *  lock hasta conocerlo (K-4: defaultear a 4 con un PIN de 6
   *  auto-submitteaba corto y quemaba presupuesto de lockout). */
  pinLength: number
  /** PIN completo tipeado: el caller corre verifyPin (async). Las celdas
   *  quedan llenas hasta la resolución (errorToken o unmount). */
  onSubmit?: (pin: string) => void
  /** Verificación en vuelo (PBKDF2 ~600ms): input ignorado en silencio,
   *  visual activo. */
  checking?: boolean
  /** Bump por intento fallido: limpia las celdas + shake + háptico de
   *  error (el componente es dueño de ESE háptico — espejo del PinPad
   *  real, pin-pad.tsx:37; el caller no lo duplica). 0 = inicial, inerte. */
  errorToken?: number
  /** Lockout activo hasta este deadline (epoch ms): pad atenuado +
   *  countdown visible; al expirar el pad revive solo. null = libre. */
  lockedUntilMs?: number | null
  /** "Olvidé mi PIN · usar contraseña" (live: USE_PASSWORD_FALLBACK,
   *  SIN logout). */
  onForgot?: () => void
}

export type AuthPinProps = AuthPinSetupProps | AuthPinLockProps

export function AuthPin(props: AuthPinProps) {
  // Sub-componentes separados: cada variante espeja una pantalla real
  // distinta con su propio estado; cambiar de variante remonta limpio.
  return props.variant === 'setup' ? <PinSetup {...props} /> : <PinLock {...props} />
}

// ─── Shake de las celdas en error ────────────────────────────────────

/** Sacudida horizontal — misma receta y timings que el PinPad real
 *  (pin-pad.tsx:40): ±8/−6/0 en pasos de motionDurations.shakeStep.
 *  Corre en el UI thread (shared value); cero re-renders por frame.
 *  `play` es estable (useCallback) para poder entrar en deps de effects. */
function useCellShake() {
  const offset = useSharedValue(0)
  // transform SIEMPRE como array presente, nunca undefined (gotcha iOS).
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }))
  const play = useCallback(() => {
    offset.value = withSequence(
      withTiming(-8, { duration: motionDurations.shakeStep }),
      withTiming(8, { duration: motionDurations.shakeStep }),
      withTiming(-6, { duration: motionDurations.shakeStep }),
      withTiming(0, { duration: motionDurations.shakeStep }),
    )
  }, [offset])
  return { animatedStyle, play }
}

// ─── variant 'setup' — espejo de PinSetupScreen ──────────────────────

type SetupPhase = 'enter' | 'confirm'

function PinSetup({
  mode,
  onBack,
  validateEntry,
  onDone,
  saving = false,
  serverError = null,
}: AuthPinSetupProps) {
  const s = AUTH_SPEC[mode]
  const { t } = useTranslation()
  const [phase, setPhase] = useState<SetupPhase>('enter')
  const [pinLength, setPinLength] = useState<number>(4)
  const [first, setFirst] = useState('')
  const [value, setValue] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const { animatedStyle: shakeStyle, play: playShake } = useCellShake()

  // Error del guardado (render-adjust, patrón serverError de 4b): un
  // valor nuevo no-null muestra el copy del caller y resetea la máquina
  // de fases igual que el catch del setup real (pin-setup-screen.tsx:94).
  const [lastServerError, setLastServerError] = useState<string | null>(serverError)
  if (serverError !== lastServerError) {
    setLastServerError(serverError)
    if (serverError) {
      setErrorMessage(serverError)
      setPhase('enter')
      setFirst('')
      setValue('')
    }
  }
  // El shake acompaña al error del caller igual que a los locales. Solo
  // side-effect de animación (sin setState): el reset de estado ya lo
  // hizo el render-adjust de arriba; el háptico lo puso el caller.
  useEffect(() => {
    if (serverError) playShake()
  }, [serverError, playShake])

  // Fallo de validación LOCAL (débil / mismatch): el componente es dueño
  // del háptico y del shake (evento propio, no viaja por props).
  const fail = (message: string) => {
    setErrorMessage(message)
    setValue('')
    void triggerHaptic('error')
    playShake()
  }

  const handleDigit = (digit: string) => {
    // saving: input inerte en silencio (patrón busy de AuthCta) — el
    // guardado real tarda (PBKDF2 ~600ms) y un tap no debe encolar nada.
    if (saving) return
    if (value.length >= pinLength) return
    const next = value + digit
    if (next.length < pinLength) {
      setValue(next)
      return
    }
    // PIN completo — misma máquina de fases que el real
    // (pin-setup-screen.tsx:57); el setPin async vive en el caller.
    if (phase === 'enter') {
      // Débil se rechaza ANTES de pedir confirmación (le ahorra al user
      // tipearlo dos veces) — mismo orden que el real; la regla y el
      // copy los inyecta el caller (isWeakPin real en live).
      const validationError = validateEntry?.(next) ?? null
      if (validationError) {
        fail(validationError)
        return
      }
      setErrorMessage(null)
      setFirst(next)
      setPhase('confirm')
      setValue('')
      void triggerHaptic('selection')
      return
    }
    if (next !== first) {
      // Mismatch: error + vuelta a la fase enter (como el real).
      setPhase('enter')
      setFirst('')
      fail(t('auth:pinSetup.mismatch'))
      return
    }
    // Confirmado: la última celda se llena y el caller corre el guardado
    // real (async). Háptico de éxito del caller — recién cuando setPin
    // resuelve (como el real); su fallo vuelve por serverError.
    setValue(next)
    onDone?.(next)
  }

  const handleBackspace = () => {
    if (saving) return
    setValue((v) => v.slice(0, -1))
  }

  const handlePickLength = (next: number) => {
    // Cambiar el largo resetea todo (espeja handlePickLength del real,
    // que también se inhibe mientras guarda).
    if (saving) return
    setPinLength(next)
    setValue('')
    setFirst('')
    setPhase('enter')
    setErrorMessage(null)
    void triggerHaptic('selection')
  }

  return (
    <AuthScreenShell mode={mode}>
      <AuthStatusBar mode={mode} />
      <View style={styles.body}>
        <AuthBackHeader mode={mode} onBack={onBack} />

        {/* key={phase}: remonta el bloque al pasar enter↔confirm para que
            título+sub entren con el fade estándar — una animación por
            cambio de fase, nada corre por frame. */}
        <Animated.View
          key={phase}
          entering={FadeInDown.duration(motionDurations.standard)}
          style={styles.titleBlock}
        >
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: s.text }]}>
              {phase === 'enter' ? t('auth:pinSetup.enterTitle') : t('auth:pinSetup.confirmTitle')}
            </Text>
            {/* Brot `zen` sub-protagonista (40dp): crear el PIN es un paso
                informativo de seguridad — la pose transmite calma/protección
                sin robar protagonismo. En web no renderiza (Skia): el
                título sostiene la fila solo. */}
            <BrotMascot pose="zen" size={40} shadow={false} />
          </View>
          <Text style={[styles.subtitle, { color: s.helper }]}>
            {phase === 'enter'
              ? t('auth:pinSetup.enterSubtitle', { length: pinLength })
              : t('auth:pinSetup.confirmSubtitle')}
          </Text>
        </Animated.View>

        {/* Slot de altura FIJA: el selector solo existe en enter (como en
            el real), pero sin reservar el alto las celdas y el pad
            saltarían en cada cambio de fase. */}
        <View style={styles.chipSlot}>
          {phase === 'enter' ? (
            <View style={styles.lengthRow}>
              {LENGTH_OPTIONS.map((opt) => (
                <LengthChip
                  key={opt}
                  mode={mode}
                  count={opt}
                  selected={pinLength === opt}
                  onPress={() => handlePickLength(opt)}
                />
              ))}
            </View>
          ) : null}
        </View>

        {/* Norma de distribución (owner 2026-07-17): las celdas respiran
            centradas entre el bloque de título/selector y el pad — el
            aire se reparte en dos, no queda un único vacío antes del pad. */}
        <AuthFlexSpacer />
        <PinCells mode={mode} length={pinLength} filledCount={value.length} shakeStyle={shakeStyle} />

        {/* Slot de error con altura mínima (mismo criterio anti-salto). */}
        <View style={styles.statusSlot}>
          {errorMessage ? (
            <Animated.View
              entering={FadeInDown.duration(motionDurations.standard)}
              style={styles.errorRow}
            >
              {/* Brot `worried` chico (34dp, receta del ctaHintRow del
                  kit): el error es el único momento emocional del setup —
                  acompaña con preocupación, no con reto. Sin Skia (web)
                  el texto sostiene la fila solo. */}
              <BrotMascot pose="worried" size={34} shadow={false} />
              <Text style={[styles.statusText, { color: ERROR_TEXT[mode] }]}>{errorMessage}</Text>
            </Animated.View>
          ) : null}
        </View>
        <AuthFlexSpacer />

        <View style={styles.padWrap}>
          <AuthDigitPad mode={mode} onDigit={handleDigit} onBackspace={handleBackspace} />
        </View>

        {/* "Cancelar" del real (botón inferior del modal) → vuelve al
            caller; inerte mientras guarda (como el real). Mismo
            tratamiento 14/800 que el link inferior del lock. */}
        <AuthLink
          mode={mode}
          tone="muted"
          onPress={saving ? undefined : onBack}
          style={[styles.bottomLink, styles.bottomLinkText]}
        >
          {t('auth:pinSetup.cancel')}
        </AuthLink>
      </View>
      <AuthHomeIndicator mode={mode} marginTop={10} />
    </AuthScreenShell>
  )
}

// ─── variant 'lock' — espejo de PinLockPanel ─────────────────────────

function PinLock({
  mode,
  onBack,
  pinLength,
  onSubmit,
  checking = false,
  errorToken = 0,
  lockedUntilMs = null,
  onForgot,
}: AuthPinLockProps) {
  const s = AUTH_SPEC[mode]
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const { animatedStyle: shakeStyle, play: playShake } = useCellShake()

  // Intento fallido (bump de errorToken): celdas vacías por render-adjust…
  const [lastErrorToken, setLastErrorToken] = useState(errorToken)
  if (errorToken !== lastErrorToken) {
    setLastErrorToken(errorToken)
    setValue('')
  }
  // …y shake + háptico como side-effects (sin setState). FIEL AL REAL:
  // no existe copy de "PIN incorrecto" en el flujo actual — no se
  // inventa; el feedback es shake + háptico (espejo de pin-pad.tsx:37,
  // que también es dueño de este háptico — el caller no lo duplica).
  useEffect(() => {
    if (errorToken === 0) return
    void triggerHaptic('error')
    playShake()
  }, [errorToken, playShake])

  // Lockout armado/desarmado: flag local derivado del deadline
  // (render-adjust). El countdown vive en LockCountdown (hoja): el tick
  // de 1 Hz no re-renderiza el subtree completo (pad + celdas + header),
  // solo la hoja (perf gama baja); al expirar avisa y el pad revive sin
  // que el caller tenga que tickear nada.
  const [lastLockedUntil, setLastLockedUntil] = useState<number | null>(lockedUntilMs)
  const [locked, setLocked] = useState(() => (lockedUntilMs ?? 0) > Date.now())
  if (lockedUntilMs !== lastLockedUntil) {
    setLastLockedUntil(lockedUntilMs)
    setLocked((lockedUntilMs ?? 0) > Date.now())
  }

  const handleDigit = (digit: string) => {
    // checking: input inerte en silencio (verify PBKDF2 ~600ms), visual
    // activo — patrón busy de AuthCta.
    if (checking || locked) return
    if (value.length >= pinLength) return
    const next = value + digit
    // La última celda se llena y el submit sale al caller (verify async);
    // las celdas quedan llenas hasta el resultado (errorToken o unmount).
    setValue(next)
    if (next.length === pinLength) onSubmit?.(next)
  }

  const handleBackspace = () => {
    if (checking || locked) return
    setValue((v) => v.slice(0, -1))
  }

  return (
    <AuthScreenShell mode={mode}>
      <AuthStatusBar mode={mode} />
      <View style={styles.body}>
        {/* El lock real NO tiene back (estás bloqueado hasta acertar o ir
            por contraseña): el círculo solo existe como navegación del
            preview dev (onBack presente). En live la fila muestra el
            logo centrado (espejo del FernLogo del panel real), con la
            MISMA altura que AuthBackHeader (circulito 44) para no mover
            el layout respecto del preview aprobado. */}
        {onBack ? (
          <AuthBackHeader mode={mode} onBack={onBack} />
        ) : (
          <View style={styles.lockLogoHeader}>
            <FernLogo size={42} palette={s.fernPalette} />
          </View>
        )}

        <Text style={[styles.title, styles.lockTitle, { color: s.text }]}>{t('auth:pinLock.title')}</Text>

        {/* Norma de distribución (owner 2026-07-17): celdas centradas
            entre el título y el pad, con el aire repartido en dos. */}
        <AuthFlexSpacer />
        <PinCells
          mode={mode}
          length={pinLength}
          filledCount={value.length}
          shakeStyle={shakeStyle}
        />

        <View style={styles.statusSlot}>
          {locked && lockedUntilMs !== null ? (
            <LockCountdown
              mode={mode}
              until={lockedUntilMs}
              onExpire={() => setLocked(false)}
            />
          ) : null}
        </View>
        <AuthFlexSpacer />

        <View style={styles.padWrap}>
          <AuthDigitPad
            mode={mode}
            onDigit={handleDigit}
            onBackspace={handleBackspace}
            disabled={locked}
          />
        </View>

        {/* AuthLink no expone accessibilityLabel y el copy visible lleva el
            separador "·" — Text propio con el a11y literal del real. Live:
            USE_PASSWORD_FALLBACK (login con contraseña, SIN logout). */}
        <Text
          accessibilityRole="button"
          accessibilityLabel={t('auth:pinLock.forgotA11y')}
          onPress={onForgot}
          style={[styles.bottomLink, styles.bottomLinkText, { color: s.linkMuted }]}
        >
          {t('auth:pinLock.forgot')}
        </Text>
      </View>
      <AuthHomeIndicator mode={mode} marginTop={10} />
    </AuthScreenShell>
  )
}

// ─── Countdown del lockout (hoja aislada) ────────────────────────────

/** Segundos restantes contra el deadline. Mínimo 1: el último segundo
 *  mostrado es 1 — el tick siguiente desbloquea en vez de "0 seg". */
function remainingSeconds(until: number): number {
  return Math.max(1, Math.ceil((until - Date.now()) / 1000))
}

/** Tick de 1 Hz aislado: cada segundo re-renderiza SOLO este bloque
 *  (Brot + texto), no el subtree completo de PinLock — mismo patrón que
 *  BridgeWaitStatus de auth-bridge.tsx. setTimeout encadenado por
 *  segundo, re-sincronizado contra el deadline epoch (los timers NO
 *  corren en background: al volver, el tick salta a los segundos
 *  reales); al agotar el countdown avisa al padre con onExpire. */
function LockCountdown({
  mode,
  until,
  onExpire,
}: {
  mode: AuthMode
  until: number
  onExpire: () => void
}) {
  const { t } = useTranslation()
  const [seconds, setSeconds] = useState(() => remainingSeconds(until))

  // Un solo anuncio al ARMAR el lockout (mount de la hoja) — el texto
  // que tickea NO es live region (TalkBack lo re-anunciaría por segundo).
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      t('auth:pinLock.lockout', { seconds: remainingSeconds(until) }),
    )
    // Solo al montar: el deadline es fijo durante la vida de la hoja (un
    // lockout nuevo la remonta vía locked=false→true).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      // Expiración contra el reloj REAL (cubre el salto post-background).
      if (seconds <= 1 || until - Date.now() <= 0) {
        onExpire()
        return
      }
      // Avance garantizado (mínimo −1) + re-sync con el deadline si el
      // tiempo real corrió más que el encadenado de timeouts.
      setSeconds((prev) => Math.min(prev - 1, remainingSeconds(until)))
    }, 1000)
    return () => clearTimeout(t)
    // onExpire/until quedan fuera de deps a propósito (el padre pasa una
    // arrow nueva por render): el tick depende SOLO del segundo actual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds])

  return (
    <Animated.View
      entering={FadeInDown.duration(motionDurations.standard)}
      style={styles.errorRow}
    >
      {/* Brot `worried` chico (34dp, sub-protagonista): el lockout es el
          momento emocional de la pantalla — preocupación que acompaña
          sin bloquear. Sin Skia (web) el texto del countdown sostiene la
          fila solo. */}
      <BrotMascot pose="worried" size={34} shadow={false} />
      <Text style={[styles.statusText, { color: ERROR_TEXT[mode] }]}>
        {t('auth:pinLock.lockout', { seconds })}
      </Text>
    </Animated.View>
  )
}

// ─── Piezas compartidas por las dos variantes ────────────────────────

function PinCells({
  mode,
  length,
  filledCount,
  shakeStyle,
}: {
  mode: AuthMode
  length: number
  filledCount: number
  shakeStyle: object
}) {
  const s = AUTH_SPEC[mode]
  const cell = CELL[mode]
  return (
    <Animated.View style={[styles.cellsRow, shakeStyle]}>
      {Array.from({ length }).map((_, i) => (
        <View
          key={i}
          style={[styles.cell, { backgroundColor: cell.background, boxShadow: cell.shadow }]}
        >
          {i < filledCount ? (
            <View style={[styles.cellDot, { backgroundColor: s.text }]} />
          ) : null}
        </View>
      ))}
    </Animated.View>
  )
}

function LengthChip({
  mode,
  count,
  selected,
  onPress,
}: {
  mode: AuthMode
  count: number
  selected: boolean
  onPress: () => void
}) {
  const { t } = useTranslation()
  const chip = CHIP[mode]
  const press = usePressScale({ pressedScale: 0.96 })
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={t('auth:pinSetup.lengthOptionA11y', { count })}
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        styles.lengthChip,
        selected
          ? { backgroundColor: chip.selectedBackground, boxShadow: chip.selectedShadow }
          : { backgroundColor: chip.idleBackground, boxShadow: chip.idleShadow },
        press.animatedStyle,
      ]}
    >
      <Text
        style={[styles.lengthChipLabel, { color: selected ? chip.selectedText : chip.idleText }]}
      >
        {t('auth:pinSetup.lengthOption', { count })}
      </Text>
    </AnimatedPressable>
  )
}

// ─── Estilos (valores propios de la pantalla, literales) ─────────────

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: 22, paddingTop: 10 },
  titleBlock: { alignItems: 'center', marginTop: 18 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: {
    fontSize: 27,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    textAlign: 'center',
  },
  lockTitle: { marginTop: 26 },
  // Fila del header del lock live (sin back): misma altura que el
  // circulito 44 de AuthBackHeader, logo centrado.
  lockLogoHeader: { height: 44, alignItems: 'center', justifyContent: 'center' },
  subtitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
    marginTop: 8,
  },
  // Altura fija = chip (9+9 padding + ~18 texto) + aire; ver comentario
  // del slot en el JSX.
  chipSlot: { height: 58, justifyContent: 'center', marginTop: 4 },
  lengthRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  lengthChip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
  lengthChipLabel: { fontSize: 13, fontWeight: '800', fontFamily: nunitoFamily('800') },
  cellsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  // Celda 46×54 radio 16: 6 celdas + 5 gaps = 326 ≤ 346 de ancho útil
  // (390 − 22·2 de gutter) — el largo máximo del selector entra sin wrap.
  cell: { width: 46, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cellDot: { width: 12, height: 12, borderRadius: 6 },
  statusSlot: { minHeight: 48, justifyContent: 'center', marginTop: 8 },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
  },
  statusText: {
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    lineHeight: 17,
    textAlign: 'center',
  },
  // El pad ya no se ancla con marginTop:'auto': los AuthFlexSpacer de
  // arriba reparten el aire (norma de distribución). El margen fijo es
  // solo un mínimo de respiro contra el statusSlot.
  padWrap: { marginTop: 8 },
  bottomLink: { marginTop: 18, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  // Tratamiento compartido de los links inferiores (setup "Cancelar" y
  // lock "Olvidé mi PIN · usar contraseña") — 14/800 unificado.
  bottomLinkText: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    textAlign: 'center',
  },
})
