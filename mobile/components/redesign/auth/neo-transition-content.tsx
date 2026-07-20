import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { FernLogo } from '@/components/auth/fern-logo'
import { BrotParticles } from '@/components/brot'
import {
  dispatchAuthFlow,
  getAuthFlowState,
} from '@/features/auth-flow/auth-flow-controller'
import type { AuthJourney, BridgeErrorKind } from '@/features/auth-flow/auth-flow-machine'
import { SOAR_AWAY_MS } from '@/features/auth-flow/auth-flow-motion'
import { hideOfflineTakeover } from '@/features/auth-flow/offline-takeover'
import { getLastUserProfile, type LastUserProfile } from '@/lib/last-user-cache'
import { verifyInternetReachable } from '@/lib/verify-internet-reachable'
import { useThemeMode } from '@/theme/theme-provider'
import { AuthBridge, type AuthBridgeState } from './auth-bridge'
import {
  AuthHomeIndicator,
  AuthLiveChrome,
  AuthScreenShell,
  AuthStatusBar,
} from './auth-kit'
import { AuthOffline } from './auth-offline'
import { AUTH_SPEC, type AuthMode } from './auth-spec'

/**
 * Contenido LIVE del TransitionOverlay (cableado arranque 2026-07-17).
 *
 * Reemplaza al `AuthTransitionSplash` DENTRO del wrapper del shell
 * (root-layout-shell.tsx). El wrapper conserva TODA la mecánica del spec
 * 2026-06-11 — fade-in → BRIDGE_OPAQUE, soar-away en 'revealing',
 * supresión bajo el launch splash, always-mounted en native — y este
 * componente solo mapea el estado de la máquina al visual del rediseño:
 *
 *   journey login/unlock · 'bridge'    → AuthBridge 'loading' (pedestal +
 *                                        "Hola, {name}" + "Cargando tu
 *                                        hogar…"; la barra se retiró)
 *                         · 'revealing' → AuthBridge 'success' (beat de
 *                                        "Todo listo ✓"; el wrapper hace
 *                                        la salida)
 *   journey signup        · bridge/revealing → cover simple (welcomeBg +
 *                                        FernLogo pop — decisión owner:
 *                                        el bridge "Cargando tu hogar…"
 *                                        NUNCA en el alta)
 *   error 'network' (y el takeover offline global) → AuthOffline (Brot
 *                                        wilted; revive + beat al
 *                                        recuperar)
 *   error 'timeout'/'unknown'          → AuthBridge 'fail' (65% durazno
 *                                        + Reintentar)
 *
 * MONTAJE: el wrapper vive always-mounted en native, pero este contenido
 * dibuja NULL en 'hidden' — el stack viejo (WarmFernLogo + 36 fireflies
 * CSS) justificaba mantenerse tibio; el del rediseño es un canvas Skia
 * (BrotParticles) + ~15 views, y dejarlo montado invisible costaría un
 * frame-callback de 60fps permanente detrás de toda la app (regresión
 * directa del trabajo de jank en Android de gama baja). El drain de
 * salida (abajo) evita el blink del unmount.
 *
 * DRAIN DE SALIDA: cuando la fase cae a 'hidden' el wrapper anima su
 * fade/soar de salida sobre este contenido; si desmontáramos al instante
 * la salida mostraría un blink vacío. El último snapshot visible queda
 * montado SOAR_AWAY_MS extra y recién ahí se dibuja null.
 */

export type NeoTransitionPhase = 'hidden' | 'bridge' | 'revealing' | 'error'

interface VisibleSnapshot {
  phase: Exclude<NeoTransitionPhase, 'hidden'>
  errorKind: BridgeErrorKind | undefined
  journey: AuthJourney
}

/** Mismo poll de auto-recuperación que el ErrorFallback que reemplaza. */
const AUTO_RETRY_POLL_MS = 5000

/** Nombre para "Hola, {name}": displayName cacheado > parte local del
 *  email > null (el caller cae al fallback i18n). Mismo criterio que el
 *  hero del login (neo-login-screen.tsx). */
function firstNameFrom(profile: LastUserProfile | null): string | null {
  const cachedName = profile?.displayName?.trim()
  if (cachedName) return cachedName.split(' ')[0]
  const email = profile?.email ?? ''
  const fromEmail = email.includes('@') ? email.split('@')[0] : ''
  if (!fromEmail) return null
  return fromEmail.charAt(0).toUpperCase() + fromEmail.slice(1)
}

function bridgeStateFor(phase: Exclude<NeoTransitionPhase, 'hidden'>): AuthBridgeState {
  if (phase === 'error') return 'fail'
  if (phase === 'revealing') return 'success'
  return 'loading'
}

export function NeoTransitionContent({
  phase,
  errorKind,
  journey,
}: {
  phase: NeoTransitionPhase
  /** Solo en 'error' ('network' cubre también el takeover global). */
  errorKind?: BridgeErrorKind
  /** Journey del viaje (bridging/bridge-error); 'revealing' ya no lo
   *  trae — acá se latchea el último visto. */
  journey?: AuthJourney
}) {
  const mode = useThemeMode().resolvedMode
  const { t } = useTranslation()

  // Latch del journey para 'revealing' (la máquina ya lo soltó). Escrito
  // en render (idempotente): el snapshot de abajo lo necesita en el
  // MISMO commit.
  const journeyRef = useRef<AuthJourney>(journey ?? 'unlock')
  if (journey !== undefined) journeyRef.current = journey

  // Snapshot visible + drain de salida (ver header).
  const [snapshot, setSnapshot] = useState<VisibleSnapshot | null>(() =>
    phase === 'hidden' ? null : { phase, errorKind, journey: journey ?? 'unlock' },
  )

  // Ajuste EN RENDER (patrón React "adjust state when props change"): el
  // branch tiene que estar dibujado en el MISMO commit en que el wrapper
  // arranca su fade-in — un useEffect lo montaría post-paint y ese primer
  // frame vería el overlay vacío.
  if (phase !== 'hidden') {
    if (
      snapshot === null ||
      snapshot.phase !== phase ||
      snapshot.errorKind !== errorKind ||
      snapshot.journey !== journeyRef.current
    ) {
      setSnapshot({ phase, errorKind, journey: journeyRef.current })
    }
  }

  // Drain: recién SOAR_AWAY_MS después de esconderse se dibuja null (la
  // salida animada del wrapper corre sobre el último snapshot).
  useEffect(() => {
    if (phase !== 'hidden') return
    const id = setTimeout(() => setSnapshot(null), SOAR_AWAY_MS)
    return () => clearTimeout(id)
  }, [phase])

  // Nombre del saludo: recargar al ARRANCAR cada viaje (tras un login el
  // cache de SecureStore pudo actualizarse con otro usuario).
  const active = phase !== 'hidden'
  const [cachedName, setCachedName] = useState<string | null>(null)
  useEffect(() => {
    if (!active) return
    let cancelled = false
    void getLastUserProfile().then((profile) => {
      if (!cancelled) setCachedName(firstNameFrom(profile))
    })
    return () => {
      cancelled = true
    }
  }, [active])
  const greetName = cachedName ?? t('auth:login.fallbackName')

  // AUTO-RECUPERACIÓN (espejo EXACTO del ErrorFallback de
  // auth-transition-splash.tsx:313-324): mientras el error del bridge
  // está visible, sondear cada 5s y reintentar apenas hay internet
  // verificada — Apple Review rechazó 1.0(11) por quedarse en el error.
  useEffect(() => {
    if (phase !== 'error') return
    const id = setInterval(() => {
      void (async () => {
        if (getAuthFlowState().phase !== 'bridge-error') return
        const online = await verifyInternetReachable()
        if (online && getAuthFlowState().phase === 'bridge-error') {
          dispatchAuthFlow({ type: 'RETRY' })
        }
      })()
    }, AUTO_RETRY_POLL_MS)
    return () => clearInterval(id)
  }, [phase])

  // Reintento (espejo del handleRetry de auth-transition-splash.tsx:
  // 279-306): error de máquina → RETRY INCONDICIONAL (el prefetch del
  // snapshot es la prueba real de conectividad — gatearlo en el probe
  // dejaba el botón muerto en redes que bloquean generate_204); después,
  // verificación ACTIVA de internet (NetInfo miente).
  const verifiedRetry = useCallback(async (): Promise<boolean> => {
    if (getAuthFlowState().phase === 'bridge-error') {
      dispatchAuthFlow({ type: 'RETRY' })
    }
    try {
      return await verifyInternetReachable()
    } catch {
      // Verificación falló — se trata como "sigue offline".
      return false
    }
  }, [])

  // AuthBridge 'fail' (kinds no-network): mismo espejo, fire-and-forget.
  // Si además el takeover global estaba activo y volvió la red, se baja
  // (igual que el handleRetry viejo).
  const bridgeRetry = useCallback(() => {
    void verifiedRetry().then((online) => {
      if (online) hideOfflineTakeover()
    })
  }, [verifiedRetry])

  // AuthOffline: el cierre del takeover se difiere a onRestored — el
  // hideOfflineTakeover del retry viejo, pero DESPUÉS del beat del
  // revive de Brot (contrato del componente: que el revive se vea).
  const offlineRestored = useCallback(() => {
    hideOfflineTakeover()
  }, [])

  if (snapshot === null) return null

  const isOfflineError = snapshot.phase === 'error' && snapshot.errorKind === 'network'

  return (
    <AuthLiveChrome>
      {isOfflineError ? (
        <AuthOffline mode={mode} onRetry={verifiedRetry} onRestored={offlineRestored} />
      ) : snapshot.journey === 'signup' && snapshot.phase !== 'error' ? (
        <NeoSignupCover mode={mode} />
      ) : (
        <AuthBridge
          mode={mode}
          state={bridgeStateFor(snapshot.phase)}
          // Journey de alta (solo llega acá en error no-network: bridge/
          // revealing van al cover): SIN saludo — el cache del último
          // perfil sería de otra persona en una cuenta recién creada
          // (review r2). El resto usa el nombre cacheado.
          name={snapshot.journey === 'signup' ? null : greetName}
          onRetry={bridgeRetry}
          // Sin onSkip: la máquina real no tiene "continuar sin
          // sincronizar" (el botón solo existe en el preview).
        />
      )}
    </AuthLiveChrome>
  )
}

// ─── Cover simple del alta ───────────────────────────────────────────

/** Mismo pop literal del cold start (auth-cold-start.tsx). */
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1)
const OVERSHOOT = Easing.bezier(0.3, 1.5, 0.4, 1)
const T_POP_MS = 80

/**
 * Cover del signup (decisión owner 2026-07-17: el bridge "Cargando tu
 * hogar…" NUNCA en el alta): welcomeBg del AUTH_SPEC + FernLogo centrado
 * con el pop del cold start — sin pedestal, sin saludo, sin barra. La
 * salida (soar) la hace el wrapper.
 */
function NeoSignupCover({ mode }: { mode: AuthMode }) {
  const s = AUTH_SPEC[mode]
  const logoOpacity = useSharedValue(0)
  const logoScale = useSharedValue(0.55)

  useEffect(() => {
    logoOpacity.value = withDelay(T_POP_MS, withTiming(1, { duration: 700, easing: EASE })) // @motion-allow: pop literal del handoff de arranque (coldstart §timeline)
    logoScale.value = withDelay(T_POP_MS, withTiming(1, { duration: 900, easing: OVERSHOOT })) // @motion-allow: pop literal del handoff de arranque (coldstart §timeline)
    // Entrada de una sola corrida por mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }))

  return (
    <AuthScreenShell mode={mode} bg={s.welcomeBg}>
      {/* Partículas de arranque (mismas 16 del cold start/bridge). */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <BrotParticles colors={s.particleColors} count={16} />
      </View>
      <AuthStatusBar mode={mode} />
      <View style={styles.coverCenter}>
        <Animated.View style={logoStyle}>
          <FernLogo size={160} palette={s.fernPalette} />
        </Animated.View>
      </View>
      <AuthHomeIndicator mode={mode} />
    </AuthScreenShell>
  )
}

const styles = StyleSheet.create({
  coverCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
