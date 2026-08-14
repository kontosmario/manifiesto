import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import Animated, {
  FadeIn,
  ReduceMotion,
  type CSSAnimationKeyframes,
} from 'react-native-reanimated'
import { WarmFernLogo } from '@/components/auth/warm-fern-logo'
import {
  dispatchAuthFlow,
  getAuthFlowState,
} from '@/features/auth-flow/auth-flow-controller'
import type { BridgeErrorKind } from '@/features/auth-flow/auth-flow-machine'
import { hideOfflineTakeover } from '@/features/auth-flow/offline-takeover'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionDurations } from '@/lib/motion'

/** Modo visual del splash: fern contemplativo o fallback de error. */
export type AuthTransitionPhase = 'showing' | 'error'
export type AuthTransitionErrorKind = BridgeErrorKind
import { triggerHaptic } from '@/lib/haptics'
import { verifyInternetReachable } from '@/lib/verify-internet-reachable'
import { authTokens } from '@/theme/palette'
import { nunitoFamily } from '@/theme/typography'

interface AuthTransitionSplashProps {
  phase: AuthTransitionPhase
  errorKind?: AuthTransitionErrorKind
}

/**
 * Splash dedicated to the post-login bridge (auth → home transition).
 *
 * Two render modes driven by `phase`:
 *  - `'showing' | 'success-pending'` → WarmFernLogo + warm halo + idle
 *    breath. The default contemplative animation.
 *  - `'error'` → fallback message + retry button. The aurora
 *    background + particles stay so the error feels in-context, not
 *    like a different screen.
 *
 * The `'success-pending'` phase is identical to `'showing'` for the
 * UI: the only difference is internal state (a hide is already
 * scheduled once the min-visible window elapses). User sees the
 * animation play through normally either way.
 *
 * The cold-start splash (`AuthLaunchSplash`) keeps its full
 * welcome-mirror layout for the launch → welcome handoff. This
 * transition splash is intentionally different.
 */
export function AuthTransitionSplash({
  phase,
  errorKind,
}: AuthTransitionSplashProps) {
  const { width, height } = useWindowDimensions()
  const reduced = useReducedMotion()
  const isError = phase === 'error'

  return (
    <View style={[styles.root, { backgroundColor: authTokens.welcomeBg }]}>
      <FirefliesLayer width={width} height={height} reduced={reduced} />
      <View style={styles.center}>
        {isError ? (
          <ErrorFallback errorKind={errorKind} />
        ) : (
          <WarmFernLogo size={180} />
        )}
      </View>
    </View>
  )
}

// ─── Fireflies — Reanimated 4 CSS animations (declarative) ─────────
//
// Why CSS animations and NOT useAnimatedStyle/useSharedValue:
//
// Per Reanimated 4's official guidance (and the
// `animating-react-native-expo` skill):
//   "Prefer animations (keyframes) for looping, staged motion, and
//    micro-interactions. Prefer shared values/worklets for gestures
//    and scroll."
//
// CSS animations are declarative — once defined, the animation runs
// entirely in the native side without per-frame worklet evaluation,
// without JS round-trips, and without shared-value reads. They are
// the correct primitive for ambient/decorative loops like a firefly
// field.
//
// Earlier iterations used 24 → 16 particles each with their own
// `useAnimatedStyle` worklet evaluating 60 times/second = 16 × 60 =
// 960 worklet evals/sec just for the particle field. Even with one
// shared tick, that worklet count contested the UI thread during
// the auth-transition window (when iOS was also doing native mounts
// for the home tree).
//
// With CSS animations: ZERO worklet evals, ZERO shared values. The
// animation system handles timing on the native side. The only cost
// is the underlying native view transform updates, which iOS's
// rendering pipeline already does very efficiently for keyframe
// animations.
//
// Campo de luciérnagas que REPLICA el look del campo de partículas del
// cold-start/welcome — el mejor que tenemos (`ParticleLayer` + `CardParticles`,
// ver welcome-screen.tsx). Aquellos son worklet; esta superficie corre mientras
// iOS monta Home, así que acá lo reproducimos en CSS declarativo (el runtime
// nativo interpola los keyframes — sin per-frame JS ni shared values). Las
// claves que copiamos del "look CardParticles":
//
//  • Órbita 2D (no solo vertical): tx = ampX·sin(fx·θ), ty = ampY·cos(fy·θ)
//    traza una elipse / figura-8 — el mismo modelo de movimiento de CardParticles.
//  • La opacity PULSA entre un PISO (>0, nunca apagada del todo — "las
//    luciérnagas laten, no estroboscopian") y un techo 0.74–0.92, a una
//    frecuencia (fb) DISTINTA de la del movimiento → el brillo respira
//    independiente de la posición (= flicker desacoplado de CardParticles).
//  • Piso + glow (boxShadow size·2.5) → siempre hay un campo suave de luz,
//    denso y vivo, igual que el welcome (no el blink-a-negro de antes).
//  • Colores y tamaños = CardParticles (#B2E08A/#C7EE9C verdes, #F0B488 peach;
//    puntos 2.4/3.2/4.0 + peach 5, con halo).
//  • Cada órbita arranca en una FASE distinta vía animationDelay NEGATIVO →
//    animada desde el frame 0, nunca estática, nunca en sincronía. (Un delay
//    POSITIVO dejaba la View en su estilo base = opacity 1 = punto fijo
//    brillante durante el delay; ése era el bug de "partículas estáticas".)
//
// Determinístico (fórmulas por índice, sin Math.random) → boot y bridge
// renderizan el MISMO campo, así el seam boot ↔ bridge sigue invisible.
const TWO_PI = Math.PI * 2
// Spread R2 (Roberts): secuencia de baja discrepancia que llena la caja sin las
// bandas diagonales del reparto naïve (el mismo fix que usa CardParticles).
const R2_X = 0.7548776662466927 // 1/g  (g ≈ 1.32471795, número plástico)
const R2_Y = 0.5698402909980532 // 1/g²
const FIREFLY_PEACH = '#F0B488'
const FIREFLY_GREENS = ['#B2E08A', '#C7EE9C'] as const

// Construye el keyframe CSS de UNA luciérnaga: 21 stops (cada 5%) que muestrean
// la órbita + el pulso de brillo. Linear entre stops aproxima las sinusoides;
// con puntos de 3-5px el facetado es imperceptible. Las fórmulas usan múltiplos
// ENTEROS de θ ∈ [0, 2π] → posición Y velocidad coinciden en el wrap 100%→0%
// (sin "salto" en el loop, igual que el modelo de CardParticles).
function buildFireflyKeyframes(p: {
  ampX: number
  ampY: number
  fx: number
  fy: number
  fb: number
  floor: number
  peak: number
}): CSSAnimationKeyframes {
  const frames: CSSAnimationKeyframes = {}
  for (let s = 0; s <= 20; s++) {
    const theta = TWO_PI * (s / 20)
    const tx = p.ampX * Math.sin(p.fx * theta)
    const ty = p.ampY * Math.cos(p.fy * theta)
    const brightness =
      p.floor + (p.peak - p.floor) * (0.5 - 0.5 * Math.cos(p.fb * theta))
    frames[`${s * 5}%`] = {
      opacity: Math.round(brightness * 1000) / 1000,
      transform: [
        { translateX: Math.round(tx * 100) / 100 },
        { translateY: Math.round(ty * 100) / 100 },
      ],
    }
  }
  return frames
}

const FIREFLY_COUNT = 36
const FIREFLIES = Array.from({ length: FIREFLY_COUNT }, (_, i) => {
  const isPeach = i % 5 === 4 // ~1/5 cálidas + más grandes (= CardParticles)
  const size = isPeach ? 5 : 2.4 + (i % 3) * 0.8 // 2.4 / 3.2 / 4.0
  const color = isPeach ? FIREFLY_PEACH : FIREFLY_GREENS[i % 2]
  // Las peach bailan más (amplitud mayor + freq 2 en ambos ejes); el resto
  // varía amplitud y mezcla freq 1/2 → trayectorias Lissajous distintas.
  const ampX = isPeach ? 20 : 10 + (i % 4) * 1.5 // 10–14.5
  const ampY = isPeach ? 18 : 11 + (i % 3) * 1.5 // 11–14
  const fx = isPeach ? 2 : i % 2 === 0 ? 1 : 2
  const fy = isPeach ? 2 : i % 3 === 0 ? 2 : 1
  const fb = 2 + (i % 2) // 2 ó 3 pulsos de brillo por órbita (≠ la del movimiento)
  const floor = 0.16 + (i % 3) * 0.02 // 0.16–0.20 (nunca apagada del todo)
  const peak = isPeach ? 0.9 : 0.92 - (i % 4) * 0.06 // 0.74–0.92 (= brightCeil)
  const ax = (0.5 + i * R2_X) % 1
  const ay = (0.5 + i * R2_Y) % 1
  const durationMs = 9000 + (i % 6) * 1200 // 9–15s — drift lento y meditativo
  const phaseMs = (i * 617) % durationMs // fase inicial ∈ [0, duración)
  return {
    key: i,
    leftPct: 5 + ax * 90, // margen interior → el glow no se corta en los bordes
    topPct: 6 + ay * 86,
    size,
    color,
    durationMs,
    phaseMs,
    glow: `0px 0px ${(size * 2.5).toFixed(1)}px ${color}`,
    keyframes: buildFireflyKeyframes({ ampX, ampY, fx, fy, fb, floor, peak }),
    restOpacity: floor + 0.22, // reduced-motion: piso suave visible + glow
  }
})

export function FirefliesLayer({
  width,
  height,
  reduced,
}: {
  width: number
  height: number
  reduced: boolean
}) {
  if (reduced) {
    return (
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {FIREFLIES.map((f) => (
          <View
            key={f.key}
            style={{
              position: 'absolute',
              width: f.size,
              height: f.size,
              borderRadius: f.size / 2,
              left: (f.leftPct / 100) * width,
              top: (f.topPct / 100) * height,
              backgroundColor: f.color,
              boxShadow: f.glow,
              opacity: f.restOpacity,
            }}
          />
        ))}
      </View>
    )
  }

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {FIREFLIES.map((f) => (
        <Animated.View
          key={f.key}
          style={{
            position: 'absolute',
            width: f.size,
            height: f.size,
            borderRadius: f.size / 2,
            left: (f.leftPct / 100) * width,
            top: (f.topPct / 100) * height,
            backgroundColor: f.color,
            // Glow estático (no worklet) — la opacity del keyframe lo atenúa
            // con la luciérnaga (RN ≥0.76: boxShadow respeta la opacity).
            boxShadow: f.glow,
            // Keyframe por-luciérnaga (órbita 2D elíptica + pulso de brillo
            // desacoplado): replica el campo worklet del welcome/CardParticles
            // en CSS declarativo. Ver buildFireflyKeyframes + el comentario del
            // array FIREFLIES. El runtime nativo interpola los stops — sin
            // per-frame JS ni worklets.
            animationName: f.keyframes,
            animationDuration: `${f.durationMs}ms`,
            // Delay NEGATIVO → la animación arranca a mitad de ciclo (fase
            // phaseMs) desde el frame 0, sin ventana estática (ver el
            // comentario del array FIREFLIES). Soportado nativamente por
            // Reanimated 4 (AnimationProgressProvider maneja delay < 0).
            animationDelay: `-${f.phaseMs}ms`,
            animationIterationCount: 'infinite',
            animationTimingFunction: 'linear',
          }}
        />
      ))}
    </View>
  )
}

// ─── Error fallback ────────────────────────────────────────────────

interface ErrorFallbackProps {
  errorKind?: AuthTransitionErrorKind
}

const AUTO_RETRY_POLL_MS = 5000

function ErrorFallback({ errorKind }: ErrorFallbackProps) {
  const { t } = useTranslation()
  const [isChecking, setChecking] = useState(false)

  const handleRetry = async () => {
    if (isChecking) return
    void triggerHaptic('selection')
    setChecking(true)
    try {
      // Error de la máquina (viaje en curso): RETRY INCONDICIONAL — el
      // prefetch del snapshot es la prueba real de conectividad. Gatearlo
      // en verifyInternetReachable dejaba el botón muerto en redes donde
      // los probes (Google/Cloudflare) están bloqueados pero el backend
      // responde. Si de verdad no hay red, el retry falla y este fallback
      // vuelve solo.
      if (getAuthFlowState().phase === 'bridge-error') {
        dispatchAuthFlow({ type: 'RETRY' })
      }
      // VERIFICACIÓN ACTIVA (round-trip real) en vez de confiar en NetInfo:
      // si NetInfo quedó "stuck" en offline (snapshot stale al resumir, o su
      // probe por defecto bloqueado), confiar en él haría que el takeover
      // offline NUNCA se esconda aunque el usuario tenga internet.
      const online = await verifyInternetReachable()
      if (online) hideOfflineTakeover()
      // Sigue offline: el fallback queda visible; el haptic del tap ya
      // dio feedback de que el intento ocurrió.
    } catch {
      // Verificación falló — tratamos como "sigue offline" (fallback queda).
    } finally {
      setChecking(false)
    }
  }

  // AUTO-RECUPERACIÓN: mientras el error del bridge está visible, sondea
  // cada 5s y reintenta solo apenas hay internet verificada — el usuario
  // no tiene que tocar nada (mismo espíritu que el recovery poll del
  // takeover offline). Un blip transitorio post-login se corrige sin
  // interacción; Apple Review rechazó 1.0(11) por quedarse en este error.
  useEffect(() => {
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
  }, [])

  // Most common case is "no internet" — a hung request, a NetInfo
  // offline state, or a timeout that's almost always network. We
  // lead with that copy. For unambiguously non-network errors we'd
  // ideally show a different message, but for now the same fallback
  // covers the user's primary need: "tell me what's wrong + let me
  // retry".
  const title = errorKind === 'network'
    ? t('auth:transitionSplash.errorNetworkTitle')
    : errorKind === 'timeout'
      ? t('auth:transitionSplash.errorTimeoutTitle')
      : t('auth:transitionSplash.errorUnknownTitle')

  const body = errorKind === 'unknown'
    ? t('auth:transitionSplash.errorUnknownBody')
    : t('auth:transitionSplash.errorNetworkBody')

  return (
    <Animated.View
      entering={FadeIn.duration(motionDurations.standard).reduceMotion(
        ReduceMotion.System,
      )}
      style={styles.errorCard}
    >
      <View style={[styles.errorIconWrap, { backgroundColor: authTokens.peach }]}>
        <MaterialIcons name="cloud-off" size={28} color="#0E3A26" />
      </View>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorBody}>{body}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('auth:transitionSplash.retry')}
        accessibilityState={{ busy: isChecking }}
        onPress={() => {
          void handleRetry()
        }}
        disabled={isChecking}
        style={({ pressed }) => [
          styles.retryButton,
          {
            backgroundColor: pressed ? '#FFFBF2DD' : '#FFFBF2',
            opacity: isChecking ? 0.7 : 1,
          },
        ]}
      >
        <Text style={styles.retryLabel}>
          {isChecking ? t('auth:transitionSplash.retrying') : t('auth:transitionSplash.retry')}
        </Text>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  errorCard: {
    alignItems: 'center',
    paddingHorizontal: 32,
    maxWidth: 360,
  },
  errorIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: -0.3,
    color: '#FFFBF2',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorBody: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,251,242,0.65)',
    textAlign: 'center',
    marginBottom: 22,
  },
  retryButton: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 999,
  },
  retryLabel: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: -0.2,
    color: '#0E3A26',
  },
})
