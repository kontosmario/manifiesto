import { useState } from 'react'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import Animated, {
  FadeIn,
  ReduceMotion,
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
const FIREFLY_COUNT = 16
const FIREFLIES = Array.from({ length: FIREFLY_COUNT }, (_, i) => ({
  key: i,
  leftPct: (i * 17 + 11) % 92,
  topPct: (i * 23 + 9) % 78,
  // Stagger duration + delay so each firefly twinkles on its own
  // rhythm. Durations 8-11s, delays 0-7s spread.
  durationMs: 8000 + ((i * 191) % 3000),
  delayMs: (i * 460) % 7000,
  color: i % 3 === 0 ? authTokens.peach : '#C7EE9C',
}))

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
            style={[
              styles.firefly,
              {
                left: (f.leftPct / 100) * width,
                top: (f.topPct / 100) * height,
                backgroundColor: f.color,
                opacity: 0.4,
              },
            ]}
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
            width: 3,
            height: 3,
            borderRadius: 1.5,
            left: (f.leftPct / 100) * width,
            top: (f.topPct / 100) * height,
            backgroundColor: f.color,
            // Keyframe animation: bell-curve opacity (firefly fades
            // in, peaks at 50%, fades out) + lissajous-style drift
            // (translateY upward at peak, slight X wiggle).
            //
            // Reanimated 4 supports keyframe percentage stops directly
            // in `animationName`. The native runtime interpolates
            // between them — no per-frame JS or worklet involvement.
            animationName: {
              '0%': {
                opacity: 0,
                transform: [{ translateY: 0 }, { translateX: 0 }],
              },
              '25%': {
                opacity: 0.45,
                transform: [{ translateY: -16 }, { translateX: 5 }],
              },
              '50%': {
                opacity: 0.65,
                transform: [{ translateY: -22 }, { translateX: -3 }],
              },
              '75%': {
                opacity: 0.45,
                transform: [{ translateY: -16 }, { translateX: 5 }],
              },
              '100%': {
                opacity: 0,
                transform: [{ translateY: 0 }, { translateX: 0 }],
              },
            },
            animationDuration: `${f.durationMs}ms`,
            animationDelay: `${f.delayMs}ms`,
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

function ErrorFallback({ errorKind }: ErrorFallbackProps) {
  const { t } = useTranslation()
  const [isChecking, setChecking] = useState(false)

  const handleRetry = async () => {
    if (isChecking) return
    void triggerHaptic('selection')
    setChecking(true)
    try {
      // VERIFICACIÓN ACTIVA (round-trip real) en vez de confiar en NetInfo:
      // si NetInfo quedó "stuck" en offline (snapshot stale al resumir, o su
      // probe por defecto bloqueado), confiar en él haría que el Reintentar
      // NUNCA funcione aunque el usuario tenga internet. Aquí hacemos un GET
      // real a endpoints confiables. Si hay conexión, escondemos la vista y
      // revelamos la pantalla de abajo; si sigue offline, el fallback queda
      // (el haptic del tap ya dio feedback de que el intento ocurrió).
      const online = await verifyInternetReachable()
      if (online) {
        // Error de la máquina (viaje en curso) → RETRY re-prefetchea y
        // sigue el viaje. Takeover offline global → simplemente se
        // esconde y la pantalla de abajo se revela.
        if (getAuthFlowState().phase === 'bridge-error') {
          dispatchAuthFlow({ type: 'RETRY' })
        }
        hideOfflineTakeover()
      }
      // Sigue offline: el fallback queda visible; el haptic del tap ya
      // dio feedback de que el intento ocurrió.
    } catch {
      // NetInfo falló — tratamos como "sigue offline" (fallback queda).
    } finally {
      setChecking(false)
    }
  }

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
    letterSpacing: -0.2,
    color: '#0E3A26',
  },
  firefly: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
})
