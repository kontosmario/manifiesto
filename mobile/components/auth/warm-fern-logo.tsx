import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  Extrapolation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { FernLogo } from '@/components/auth/fern-logo'
import { useUnboundedLoopAnimation } from '@/hooks/use-unbounded-loop-animation'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionEasings } from '@/lib/motion'
import { authTokens } from '@/theme/palette'

interface WarmFernLogoProps {
  size?: number
}

// ─── Timeline ───────────────────────────────────────────────────────
//
// Two SharedValues drive everything:
//
//   1) `entranceProgress` — 0 → 1 over 2400ms with the `warm` easing
//      (bezier(0.45, 0, 0.55, 1) — symmetric inOut, anti-pop). Drives:
//        • Fern wrapper opacity     0 → 1
//        • Fern wrapper scale       0.88 → 1.0
//        • Wordmark opacity         0 → 1   (gated to start at 0.5)
//        • Wordmark translateY      8 → 0   (matches opacity gate)
//
//   2) `pulseProgress` — 0 ↔ 1 ↔ 0 loop, ~3000ms total cycle, runs
//      forever from t=0. Drives:
//        • Peach halo opacity       0.14 ↔ 0.30   (continuous pulse)
//        • Peach halo scale         1.0 ↔ 1.05    (gentle breath)
//        • Fern idle scale modifier 1.0 ↔ 1.012   (gated to kick in
//          only after entrance finishes — avoids fighting the entrance
//          scale animation)
//
// Total: 2 SharedValues, multiple derived values via interpolate.
const ENTRANCE_DURATION_MS = 2400
const PULSE_HALF_CYCLE_MS = 1500
const HALO_SIZE = 280
const WORDMARK_OPACITY_START = 0.5 // fades in during the second half of the entrance

export function WarmFernLogo({ size = 180 }: WarmFernLogoProps) {
  const reduced = useReducedMotion()

  // Initial = 0 even when reduced (we snap to 1 inside the effect).
  // Starting at 0 means the first paint already shows the start state
  // (fern invisible/small, halo dim) — no first-frame flicker.
  const entranceProgress = useSharedValue(reduced ? 1 : 0)
  const pulseProgress = useSharedValue(0)

  useEffect(() => {
    if (reduced) {
      entranceProgress.value = 1
      return
    }
    entranceProgress.value = withTiming(1, {
      duration: ENTRANCE_DURATION_MS,
      easing: motionEasings.warm,
    })
  }, [entranceProgress, reduced])

  useEffect(() => {
    return () => {
      cancelAnimation(entranceProgress)
    }
  }, [entranceProgress])

  // Pulse loop — runs forever from mount. useUnboundedLoopAnimation
  // handles cleanup + reduced-motion fallback (parks at 0). The pulse
  // drives the peach halo opacity/scale immediately, AND the fern's
  // idle breath after the entrance settles (gated via interpolate
  // against entranceProgress to avoid fighting the entrance).
  useUnboundedLoopAnimation(
    () => {
      pulseProgress.value = withRepeat(
        withSequence(
          withTiming(1, {
            duration: PULSE_HALF_CYCLE_MS,
            easing: Easing.inOut(Easing.quad),
          }),
          withTiming(0, {
            duration: PULSE_HALF_CYCLE_MS,
            easing: Easing.inOut(Easing.quad),
          }),
        ),
        -1,
        false,
      )
    },
    [pulseProgress],
  )

  // ── Worklet styles ────────────────────────────────────────────────

  const haloStyle = useAnimatedStyle(() => {
    const opacity = interpolate(pulseProgress.value, [0, 1], [0.14, 0.30])
    const scale = interpolate(pulseProgress.value, [0, 1], [1.0, 1.05])
    return {
      opacity,
      transform: [{ scale }],
    }
  })

  const fernWrapperStyle = useAnimatedStyle(() => {
    const entranceScale = interpolate(
      entranceProgress.value,
      [0, 1],
      [0.88, 1.0],
      Extrapolation.CLAMP,
    )
    // Idle breath only after the entrance is fully settled. The gate
    // ramps 0 → 1 between entranceProgress 0.95 and 1.0, so the
    // transition into the breath is smooth.
    const breathInfluence = interpolate(
      entranceProgress.value,
      [0.95, 1.0],
      [0, 1],
      Extrapolation.CLAMP,
    )
    const breathFactor = 1 + pulseProgress.value * 0.012 * breathInfluence
    return {
      opacity: entranceProgress.value,
      transform: [{ scale: entranceScale * breathFactor }],
    }
  })

  const wordmarkStyle = useAnimatedStyle(() => {
    // Wordmark fades in during the SECOND HALF of the entrance, after
    // the fern has reached enough presence to read it as the anchor.
    const opacity = interpolate(
      entranceProgress.value,
      [WORDMARK_OPACITY_START, 1],
      [0, 1],
      Extrapolation.CLAMP,
    )
    const translateY = interpolate(
      entranceProgress.value,
      [WORDMARK_OPACITY_START, 1],
      [8, 0],
      Extrapolation.CLAMP,
    )
    return {
      opacity,
      transform: [{ translateY }],
    }
  })

  // Optical-centring shift. The fern SVG is geometrically centred in
  // its 502-wide viewBox, but the visual mass (stem + pill + bowl)
  // sits ~10% left of that geometric centre — so when we lay it out
  // by box, the user perceives the brand mark as offset-left. The
  // welcome screen + cold-start splash compensate with `translateX:
  // 22` (calibrated for size=220, i.e. 22/220 = 10% of size). We
  // scale that ratio to whatever `size` this instance uses, so the
  // mark looks centred at any size. Both the halo AND the fern shift
  // together — they stay concentric, so the halo wraps the optical
  // centre of the brand mark rather than the geometric box.
  const opticalShiftX = size * (22 / 220)

  return (
    <View style={styles.root}>
      {/* Fern block — fern + halo behind it. Halo is centered absolutely
          on the fern, not the whole column, so the wordmark below
          doesn't shift the halo's anchor. */}
      <View style={[styles.fernBlock, { transform: [{ translateX: opticalShiftX }] }]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.peachHalo,
            { backgroundColor: authTokens.peach },
            haloStyle,
          ]}
        />
        <Animated.View style={fernWrapperStyle}>
          <FernLogo size={size} palette="light" animate={false} />
        </Animated.View>
      </View>

      {/* Wordmark — same Manifiesto. mark used by the launch splash &
          welcome screen. Fades in slow + soft, no snappy translate
          spring; just a gentle 8pt rise paired with the opacity. */}
      <Animated.View style={[styles.wordmarkRow, wordmarkStyle]}>
        <Text style={styles.wordmark}>Manifiesto</Text>
        <Text style={[styles.wordmark, styles.wordmarkDot]}>.</Text>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fernBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  // Round peach halo, centered absolutely on the fern. Bigger than
  // the fern so the wash extends past the brand mark and feels like
  // ambient warmth, not a sticker behind it.
  peachHalo: {
    position: 'absolute',
    width: HALO_SIZE,
    height: HALO_SIZE,
    borderRadius: HALO_SIZE / 2,
    top: '50%',
    left: '50%',
    marginTop: -HALO_SIZE / 2,
    marginLeft: -HALO_SIZE / 2,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 24,
  },
  wordmark: {
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: -2,
    color: '#FFFBF2',
  },
  wordmarkDot: {
    color: authTokens.peach,
  },
})
