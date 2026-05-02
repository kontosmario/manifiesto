import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import Animated, {
  FadeIn,
  ReduceMotion,
} from 'react-native-reanimated'
import {
  AuroraLayer,
  ParticleLayer,
} from '@/components/auth/auth-launch-splash'
import { WarmFernLogo } from '@/components/auth/warm-fern-logo'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import {
  hideAuthTransitionSplash,
  showAuthTransitionSplash,
  type AuthTransitionErrorKind,
  type AuthTransitionPhase,
} from '@/lib/auth-transition-splash'
import { motionDurations } from '@/lib/motion'
import { triggerHaptic } from '@/lib/haptics'
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
      <AuroraLayer width={width} height={height} reduced={reduced} randomize />
      <ParticleLayer width={width} height={height} reduced={reduced} />
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

// ─── Error fallback ────────────────────────────────────────────────

interface ErrorFallbackProps {
  errorKind?: AuthTransitionErrorKind
}

function ErrorFallback({ errorKind }: ErrorFallbackProps) {
  const handleRetry = () => {
    void triggerHaptic('selection')
    // Force-hide the splash, then immediately re-show it. The
    // re-show resets the state machine to `showing` with a fresh
    // showStartedAt + safety timer; whatever code triggered the
    // original splash should also re-trigger the underlying refetch.
    // For the home-snapshot bridge this is enough because mounting
    // the gate components again replays the loading state.
    hideAuthTransitionSplash()
    showAuthTransitionSplash()
  }

  // Most common case is "no internet" — a hung request, a NetInfo
  // offline state, or a timeout that's almost always network. We
  // lead with that copy. For unambiguously non-network errors we'd
  // ideally show a different message, but for now the same fallback
  // covers the user's primary need: "tell me what's wrong + let me
  // retry".
  const title = errorKind === 'network'
    ? 'Sin conexión a internet'
    : errorKind === 'timeout'
      ? 'La conexión está demorando'
      : 'No pudimos cargar tu espacio'

  const body = errorKind === 'unknown'
    ? 'Algo no respondió. Intentá de nuevo.'
    : 'Revisá tu wifi o datos móviles e intentá de nuevo.'

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
        accessibilityLabel="Reintentar"
        onPress={handleRetry}
        style={({ pressed }) => [
          styles.retryButton,
          { backgroundColor: pressed ? '#FFFBF2DD' : '#FFFBF2' },
        ]}
      >
        <Text style={styles.retryLabel}>Reintentar</Text>
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
})
