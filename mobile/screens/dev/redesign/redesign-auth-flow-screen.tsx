// @i18n-ignore-file — tooling dev-only gated por __DEV__.
import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Auth3aBienvenida } from '@/components/redesign/auth/auth-3a-bienvenida'
import { Auth4aCrearCuenta } from '@/components/redesign/auth/auth-4a-crear-cuenta'
import { Auth4bLogin } from '@/components/redesign/auth/auth-4b-login'
import { Auth4cFaceId } from '@/components/redesign/auth/auth-4c-faceid'
import { AuthBridge } from '@/components/redesign/auth/auth-bridge'
import { AuthColdStart } from '@/components/redesign/auth/auth-cold-start'
import { AuthForgotPassword } from '@/components/redesign/auth/auth-forgot-password'
import { AuthLoginVistas } from '@/components/redesign/auth/auth-login-vistas'
import { AuthOffline } from '@/components/redesign/auth/auth-offline'
import { AuthPin } from '@/components/redesign/auth/auth-pin'
import { AuthPlanHogar } from '@/components/redesign/auth/auth-plan-hogar'
import { AUTH_SPEC, type AuthMode } from '@/components/redesign/auth/auth-spec'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'

/**
 * Flujo interactivo del rediseño de autenticación (preview dev-only).
 * Espejo de redesign-onboarding-flow-screen: estado demo local +
 * toggle flotante claro/oscuro (chrome del preview, NO del mockup).
 *
 * Cubre las 4 réplicas (3a/4a/4b/4c, APROBADAS) y las derivadas sin
 * mockup: vistas del login real, olvidé-contraseña, PIN (setup + lock),
 * bridge, sin conexión y los arranques del handoff.
 *
 * RECORRIDOS (espejan la máquina real, auth-flow-machine.ts — mapa
 * completo 2026-07-17; el bridge queda reservado a "abrir una sesión",
 * decisión owner):
 *   A · frío sin sesión:  coldstart → Bienvenida → alta o login
 *   B · frío con sesión:  coldstart-sesion → bridge → Inicio
 *   B3 · con PIN:         pin-lock → bridge → Inicio
 *   C · login (todas las vistas, sociales incl.): → bridge → Inicio
 *   D · alta desde cero:  signup → faceid (SIN bridge) → onboarding
 *       (cruza al flujo del rediseño del onboarding; "Usar un PIN"
 *       pasa por pin-setup?next=onboarding)
 *   F · forgot:           forgot → código OK → bridge → Inicio
 * "Inicio" todavía no tiene rediseño (turno 1b/1c): esos recorridos
 * terminan volviendo al índice.
 *
 * A diferencia del onboarding, las pantallas de auth dibujan su propia
 * status bar y home indicator (parte del mockup), así que el host va
 * full-bleed (sin padding de insets). Al cablear live se descartan por
 * SafeAreaView + StatusBar real.
 *
 * Entrada por ?step= (sub-índice de aprobación por pantalla).
 */

// ── Demo del PIN (setup + lock) ──────────────────────────────────────
// La réplica AuthPin dejó de traer estado demo interno (contrato live:
// validateEntry/onDone(pin) + onSubmit/checking/errorToken/lockedUntilMs)
// — el host del preview simula el engine local, como con el login.

/** PIN correcto del preview. El real verifica PBKDF2 contra SecureStore
 *  (verifyPin, mobile/lib/pin-lock.ts) — acá comparación literal. */
const DEMO_PIN = '1234'
/** Delay del verify demo ≈ el costo real del PBKDF2 (~600ms): ejercita
 *  el estado checking del contrato. */
const DEMO_PIN_VERIFY_MS = 600
/** Umbral real: 5 intentos fallidos disparan el lockout
 *  (LOCKOUT_THRESHOLD, mobile/lib/pin-lock.ts:141). */
const DEMO_PIN_LOCKOUT_THRESHOLD = 5
/** El demo castiga con el PRIMER escalón del schedule real (30 s); el
 *  real duplica en cada reincidencia hasta 8 min. */
const DEMO_PIN_LOCKOUT_MS = 30_000

/** Copy literal auth:pinSetup.weakPin (el live pasa el suyo). */
const DEMO_WEAK_PIN_COPY =
  'Ese PIN es muy fácil de adivinar. Evita repeticiones (1111) o secuencias (1234).'

/**
 * Réplica local (pura) del isWeakPin real (mobile/lib/pin-lock.ts:116):
 * todos los dígitos iguales o secuencia monótona ±1. La lista
 * hardcodeada de PINs débiles del real no se transcribe — al demo le
 * alcanza con disparar el error con los ejemplos del copy (1111, 1234).
 * Importar pin-lock.ts arrastraría SecureStore + supabase a una
 * pantalla dev-only.
 */
function isWeakPinDemo(pin: string): boolean {
  if (pin.split('').every((d) => d === pin[0])) return true
  let ascending = true
  let descending = true
  for (let i = 1; i < pin.length; i++) {
    const prev = pin.charCodeAt(i - 1) - 48
    const cur = pin.charCodeAt(i) - 48
    if (cur !== prev + 1) ascending = false
    if (cur !== prev - 1) descending = false
  }
  return ascending || descending
}

/** validateEntry del preview (live: isWeakPin real + copy real). */
function demoValidatePin(pin: string): string | null {
  return isWeakPinDemo(pin) ? DEMO_WEAK_PIN_COPY : null
}

const AUTH_STEPS = [
  'coldstart',
  'coldstart-sesion',
  'welcome',
  'signup',
  'login',
  'login-returning',
  'login-faceid',
  'login-secondary',
  'forgot',
  'bridge',
  'bridge-error',
  'faceid',
  'pin-setup',
  'pin-lock',
  'plan',
  'offline',
] as const
type AuthStep = (typeof AUTH_STEPS)[number]

function isAuthStep(value: string | undefined): value is AuthStep {
  return AUTH_STEPS.includes(value as AuthStep)
}

export function RedesignAuthFlowScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ step?: string }>()

  const entryStep: AuthStep = isAuthStep(params.step) ? params.step : 'welcome'
  const [mode, setMode] = useState<AuthMode>('light')
  const [step, setStepState] = useState<AuthStep>(entryStep)
  const [navDir, setNavDir] = useState<'fwd' | 'back'>('fwd')

  // Cold start: el overlay corre una vez por entrada al paso y al
  // terminar se desmonta, dejando la pantalla real debajo — el paso no
  // cambia, solo desaparece el splash. El reset vive en setStep
  // (evento de navegación), no en un effect.
  const [coldDone, setColdDone] = useState(false)

  // ── Demo del submit de login (el gate manif026 vivía ADENTRO de las
  // pantallas; con el contrato live — onContinue(payload) + submitting +
  // serverError — la simulación pasa al host del preview). El delay
  // ejercita el mismo ciclo que el cableado real: submit → busy +
  // error=null → resolución async → error o avance.
  const DEMO_PASSWORD = 'manif026'
  const DEMO_SUBMIT_MS = 700
  const [loginSubmitting, setLoginSubmitting] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  // Demo del escaneo biométrico (vista face-id): el swap de label +
  // happy path también vivían adentro; ahora el host simula el prompt.
  const [scanning, setScanning] = useState(false)
  // Demo del lock de PIN: checking/errorToken/lockout viven en el host
  // (el contrato live los inyecta) — espejo del panel live con el
  // schedule acotado al primer escalón (30 s).
  const [pinChecking, setPinChecking] = useState(false)
  const [pinErrorToken, setPinErrorToken] = useState(0)
  const [pinLockedUntil, setPinLockedUntil] = useState<number | null>(null)
  // Presupuesto de intentos del demo (solo lo lee el timeout: ref).
  const pinAttemptsRef = useRef(0)
  const demoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearDemoTimer = () => {
    if (demoTimer.current) {
      clearTimeout(demoTimer.current)
      demoTimer.current = null
    }
  }
  // Desmontaje del preview: nunca dejar timers vivos.
  useEffect(() => clearDemoTimer, [])

  const demoLoginSubmit = (password: string, onOk: () => void) => {
    if (loginSubmitting) return
    clearDemoTimer()
    setLoginSubmitting(true)
    setLoginError(null)
    demoTimer.current = setTimeout(() => {
      demoTimer.current = null
      setLoginSubmitting(false)
      if (password !== DEMO_PASSWORD) {
        // Anti-enumeración: SIEMPRE el genérico (auth:errors.genericSignIn).
        setLoginError('Email o contraseña incorrectos.')
        void triggerHaptic('error')
        return
      }
      onOk()
    }, DEMO_SUBMIT_MS)
  }

  const demoBiometric = (onOk: () => void) => {
    if (scanning) return
    clearDemoTimer()
    setScanning(true)
    demoTimer.current = setTimeout(() => {
      demoTimer.current = null
      setScanning(false)
      void triggerHaptic('success')
      onOk()
    }, 1600)
  }

  // ── Demo del takeover offline (contrato live 2026-07-17: el round-trip
  // vive en el CALLER — la app pasa verifyInternetReachable; acá se
  // simula el presupuesto aprobado: el 1er intento FALLA, el 2º
  // recupera). AuthOffline solo anima el resultado.
  const OFFLINE_CHECK_DEMO_MS = 1400
  const offlineAttempts = useRef(0)
  const demoOfflineRetry = () =>
    new Promise<boolean>((resolve) => {
      clearDemoTimer()
      offlineAttempts.current += 1
      const online = offlineAttempts.current >= 2
      demoTimer.current = setTimeout(() => {
        demoTimer.current = null
        resolve(online)
      }, OFFLINE_CHECK_DEMO_MS)
    })

  // ── Demo del verify del lock de PIN (el PIN demo vivía ADENTRO de la
  // réplica; con el contrato live — onSubmit(pin) + checking +
  // errorToken + lockedUntilMs — la simulación pasa al host). El delay
  // ejercita el mismo ciclo que el panel live: submit → checking →
  // resolución async → éxito o errorToken (+ lockout al 5º fallo).
  const demoPinSubmit = (pin: string) => {
    if (pinChecking) return
    clearDemoTimer()
    setPinChecking(true)
    demoTimer.current = setTimeout(() => {
      demoTimer.current = null
      setPinChecking(false)
      if (pin === DEMO_PIN) {
        // Háptico de éxito del caller (como el panel live).
        void triggerHaptic('success')
        setStep('bridge')
        return
      }
      const failed = pinAttemptsRef.current + 1
      if (failed >= DEMO_PIN_LOCKOUT_THRESHOLD) {
        // Al armar el lockout el presupuesto demo vuelve a cero: cuando
        // el countdown termina hay 5 intentos frescos. El real NO
        // resetea — conserva el schedule exponencial (30s→1m→2m→4m→8m).
        pinAttemptsRef.current = 0
        setPinLockedUntil(Date.now() + DEMO_PIN_LOCKOUT_MS)
      } else {
        pinAttemptsRef.current = failed
      }
      // Shake + háptico de error + celdas vacías los pone la réplica
      // (dueña de ese feedback — espejo del PinPad real).
      setPinErrorToken((prev) => prev + 1)
    }, DEMO_PIN_VERIFY_MS)
  }

  // ── Demo del forgot (contrato live: stage/sentTo/cooldown los controla
  // el CALLER — acá el host, en la app la neo screen). El "server" del
  // preview siempre acepta (anti-enumeración de la real: éxito genérico
  // aunque el email no exista); el gate de fallo es un email que empiece
  // con "error@" — ejercita serverError como manif026 ejercita el del
  // login. Cooldown corto (el live usa 60s) para recorrer el ciclo
  // link → reenviado → link sin esperar un minuto.
  const DEMO_FORGOT_FAIL_PREFIX = 'error@'
  const DEMO_FORGOT_COOLDOWN_S = 10
  const [forgotStage, setForgotStage] = useState<'form' | 'sent'>('form')
  const [forgotSentTo, setForgotSentTo] = useState('')
  const [forgotSubmitting, setForgotSubmitting] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)
  const [forgotCooldown, setForgotCooldown] = useState(0)

  // Tick del countdown demo: 1 seg por segundo mientras corre.
  useEffect(() => {
    if (forgotCooldown <= 0) return
    const id = setTimeout(() => setForgotCooldown((c) => Math.max(0, c - 1)), 1000) // @motion-allow: reloj 1s del countdown demo de reenvío, no es una animación
    return () => clearTimeout(id)
  }, [forgotCooldown])

  const demoForgotSubmit = (email: string) => {
    if (forgotSubmitting) return
    clearDemoTimer()
    setForgotSubmitting(true)
    setForgotError(null)
    demoTimer.current = setTimeout(() => {
      demoTimer.current = null
      setForgotSubmitting(false)
      // normalizeEmail de la real (trim + lowercase), transcripto — mismo
      // criterio anti-acople que el componente.
      const normalized = email.trim().toLowerCase()
      if (normalized.startsWith(DEMO_FORGOT_FAIL_PREFIX)) {
        setForgotError('No pudimos enviar el email.') // auth:forgotPassword.errorSendFailed
        void triggerHaptic('error')
        return
      }
      void triggerHaptic('success')
      setForgotSentTo(normalized)
      setForgotStage('sent')
    }, DEMO_SUBMIT_MS)
  }

  const demoForgotResend = () => {
    if (forgotCooldown > 0) return
    void triggerHaptic('success')
    setForgotCooldown(DEMO_FORGOT_COOLDOWN_S)
  }

  const setStep = (next: AuthStep) => {
    setNavDir(AUTH_STEPS.indexOf(next) >= AUTH_STEPS.indexOf(step) ? 'fwd' : 'back')
    if (next === 'coldstart' || next === 'coldstart-sesion') setColdDone(false)
    // Cambio de pantalla: cancelar demos en vuelo y arrancar limpio.
    clearDemoTimer()
    setLoginSubmitting(false)
    setLoginError(null)
    setScanning(false)
    setPinChecking(false)
    setPinErrorToken(0)
    setPinLockedUntil(null)
    pinAttemptsRef.current = 0
    setForgotStage('form')
    setForgotSentTo('')
    setForgotSubmitting(false)
    setForgotError(null)
    setForgotCooldown(0)
    offlineAttempts.current = 0
    setStepState(next)
  }

  // El bridge ya no necesita timer del host: su timeline propio (handoff
  // arranque) termina en fade y avisa por onDone.

  // Tras el bridge el flujo real revela el INICIO — todavía sin
  // rediseño (turno 1b/1c pendiente): el recorrido del preview termina
  // y vuelve al índice.
  const exitToIndex = () => router.back()

  // El alta desemboca en el ONBOARDING real (biometric-setup marca su
  // flag y hace replace a /(app)/onboarding) — acá cruza al flujo del
  // rediseño del onboarding, ya aprobado.
  const goOnboarding = () =>
    router.push('/(app)/settings/dev/redesign-onboarding?step=5a' as never)

  const s = AUTH_SPEC[mode]

  const screen = (() => {
    switch (step) {
      case 'signup':
        // Alta desde cero: SIN bridge (decisión owner 2026-07-17). En la
        // máquina real SIGNUP_SUCCESS sí pasa por 'bridging', pero es un
        // tránsito corto hacia biometric-setup que no cubre el request;
        // el bridge del rediseño ("Cargando tu hogar…") queda reservado
        // a login/arranque con sesión — acá la transición de paso cubre
        // el navigate, como el flujo real cubre el suyo.
        return (
          <Auth4aCrearCuenta
            mode={mode}
            onBack={() => setStep('welcome')}
            onCreate={() => setStep('faceid')}
            onApple={() => setStep('faceid')}
            onGoogle={() => setStep('faceid')}
          />
        )
      case 'login':
        return (
          <Auth4bLogin
            mode={mode}
            onBack={() => setStep('welcome')}
            onContinue={({ password }) => demoLoginSubmit(password, () => setStep('bridge'))}
            onForgot={() => setStep('forgot')}
            onApple={() => setStep('bridge')}
            onGoogle={() => setStep('bridge')}
            submitting={loginSubmitting}
            serverError={loginError}
          />
        )
      case 'login-returning':
      case 'login-faceid':
      case 'login-secondary': {
        const view =
          step === 'login-returning'
            ? 'returning'
            : step === 'login-faceid'
              ? 'face-id'
              : 'secondary-only'
        return (
          <AuthLoginVistas
            mode={mode}
            view={view}
            onBack={() => setStep('welcome')}
            onContinue={({ password }) => demoLoginSubmit(password, () => setStep('bridge'))}
            onBiometric={() => demoBiometric(() => setStep('bridge'))}
            scanning={scanning}
            submitting={loginSubmitting}
            serverError={loginError}
            onForgot={() => setStep('forgot')}
            onApple={() => setStep('bridge')}
            onGoogle={() => setStep('bridge')}
            onUsePassword={() => setStep('login-returning')}
            onChangeAccount={() => setStep('login')}
            // Espeja handleCancelForm del login real: vuelve a la vista
            // de métodos.
            onChooseAnotherMethod={() => setStep('login-faceid')}
          />
        )
      }
      case 'forgot':
        return (
          <AuthForgotPassword
            mode={mode}
            stage={forgotStage}
            sentTo={forgotSentTo}
            submitting={forgotSubmitting}
            serverError={forgotError}
            resendCooldown={forgotCooldown}
            // Preview: back desde `sent` vuelve al `form` (el componente
            // resetea el código por render-adjust; el email tipeado se
            // conserva) para recorrer ambos estados sin remontar. La neo
            // screen usa back → login en ambos, como la real.
            onBack={() => {
              if (forgotStage === 'sent') {
                setForgotStage('form')
                setForgotCooldown(0)
                return
              }
              setStep('login')
            }}
            onSubmitEmail={demoForgotSubmit}
            // Recorrido F: código completo → bridge → Inicio.
            onCodeComplete={() => setStep('bridge')}
            onResend={demoForgotResend}
          />
        )
      case 'coldstart':
        // Recorrido A (arranque frío SIN sesión): splash → Bienvenida.
        return (
          <View style={styles.stepHost}>
            <Auth3aBienvenida
              mode={mode}
              onStart={() => setStep('signup')}
              onHaveAccount={() => setStep('login')}
            />
            {coldDone ? null : <AuthColdStart mode={mode} onDone={() => setColdDone(true)} />}
          </View>
        )
      case 'coldstart-sesion':
        // Recorrido B (arranque CON sesión): splash → bridge → Inicio.
        // En la app real el splash SUPRIME al overlay y él mismo hace la
        // cobertura con su soar; en el lenguaje de los handoffs nuevos
        // el recorrido se muestra en secuencia: el splash se disuelve y
        // el bridge arranca (pedestal pop) hasta su fade.
        return (
          <View style={styles.stepHost}>
            {coldDone ? (
              <AuthBridge mode={mode} state="success-standalone" onDone={exitToIndex} />
            ) : (
              <View style={[styles.stepHost, { backgroundColor: s.welcomeBg }]} />
            )}
            {coldDone ? null : <AuthColdStart mode={mode} onDone={() => setColdDone(true)} />}
          </View>
        )
      case 'bridge':
        // Success standalone (timeline completa del handoff con fade
        // propio — bajo el wrapper real el estado es 'loading'→'success'
        // y la salida la hace el soar del shell): el fade revela el
        // Inicio en la app real. Sin Inicio rediseñado aún → termina el
        // recorrido.
        return <AuthBridge mode={mode} state="success-standalone" onDone={exitToIndex} />
      case 'bridge-error':
        return (
          <AuthBridge
            mode={mode}
            state="fail"
            onRetry={() => setStep('bridge')}
            // "Continuar sin sincronizar": entra al Inicio igual (real).
            onSkip={exitToIndex}
          />
        )
      case 'faceid':
        // biometric-setup real: CUALQUIER salida (activar / ahora no)
        // marca el flag y sigue al onboarding; "Usar un PIN" pasa por
        // pin-setup?next=onboarding.
        return (
          <Auth4cFaceId
            mode={mode}
            onActivate={goOnboarding}
            onUsePin={() => setStep('pin-setup')}
            onSkip={goOnboarding}
          />
        )
      case 'pin-setup':
        return (
          <AuthPin
            mode={mode}
            variant="setup"
            onBack={() => setStep('faceid')}
            // Validación débil inyectada (live: isWeakPin real + copy real).
            validateEntry={demoValidatePin}
            // Real: pin-setup?next=onboarding — al confirmar corre setPin
            // (async) y recién después sigue al onboarding. Demo: guardado
            // instantáneo que nunca falla; háptico de éxito del caller
            // (como la neo screen).
            onDone={() => {
              void triggerHaptic('success')
              goOnboarding()
            }}
          />
        )
      case 'pin-lock':
        // Recorrido B3 (arranque con PIN): desbloquear → bridge → Inicio.
        // El verify es del host (contrato live): delay ~PBKDF2 + lockout
        // demo del primer escalón.
        return (
          <AuthPin
            mode={mode}
            variant="lock"
            pinLength={DEMO_PIN.length}
            onBack={() => setStep('pin-setup')}
            onSubmit={demoPinSubmit}
            checking={pinChecking}
            errorToken={pinErrorToken}
            lockedUntilMs={pinLockedUntil}
            // Real: USE_PASSWORD_FALLBACK → login con contraseña (SIN
            // logout); en el preview cae en la vista de login.
            onForgot={() => setStep('login')}
          />
        )
      case 'plan':
        // Paywall welcomeMode (post-onboarding, 1 vez; luego desde
        // Ajustes). CTA verde = continuar con los 30 días → Inicio (sin
        // rediseño aún → sale al índice). Secundario = comprar (demo:
        // sale igual). Los links no navegan en el preview.
        return (
          <AuthPlanHogar
            mode={mode}
            onContinueFree={exitToIndex}
            onSubscribe={exitToIndex}
          />
        )
      case 'offline':
        // Takeover global (no es un paso del viaje): en el preview se
        // entra por el índice. El round-trip vive en el host (contrato
        // live): 1er intento falla, 2º recupera → tras el beat del
        // revive vuelve a la bienvenida.
        return (
          <AuthOffline
            mode={mode}
            onRetry={demoOfflineRetry}
            onRestored={() => setStep('welcome')}
          />
        )

      default:
        return (
          <Auth3aBienvenida
            mode={mode}
            onStart={() => setStep('signup')}
            onHaveAccount={() => setStep('login')}
          />
        )
    }
  })()

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor:
            step === 'welcome' || step === 'coldstart' || step === 'coldstart-sesion'
              ? s.welcomeBg
              : s.bg,
        },
      ]}
    >
      <Animated.View
        key={step}
        entering={(navDir === 'fwd' ? FadeInRight : FadeInLeft).duration(motionDurations.enterStack)}
        style={styles.stepHost}
      >
        {screen}
      </Animated.View>

      {/* Chrome del preview: toggle de tema + paso + salir. Flotante,
          NO es parte del mockup. */}
      <View pointerEvents="box-none" style={[styles.devChrome, { top: insets.top + 6 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Alternar tema del preview"
          onPress={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
          style={[styles.devToggle, { borderColor: s.helper }]}
        >
          <Text style={styles.devToggleIcon}>{mode === 'light' ? '🌙' : '☀️'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Salir del preview"
          onPress={() => router.back()}
          style={[styles.devToggle, { borderColor: s.helper }]}
        >
          <Text style={styles.devToggleIcon}>✕</Text>
        </Pressable>
        <Text style={[styles.devStep, { color: s.helper }]}>{step}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stepHost: { flex: 1 },
  devChrome: {
    position: 'absolute',
    right: 10,
    alignItems: 'center',
    gap: 3,
  },
  devToggle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devToggleIcon: { fontSize: 14 },
  devStep: { fontSize: 9, fontWeight: '800', fontFamily: nunitoFamily('800') },
})
