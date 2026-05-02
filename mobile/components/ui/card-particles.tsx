import { useMemo, useState } from 'react'
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useLoopAnimation } from '@/hooks/use-loop-animation'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface CardParticlesProps {
  /** Particle count. 4–8 typical. Default 6. */
  count?: number
  /** Base color used by 2/3 of the particles. */
  color?: string
  /** Optional warm accent for 1/3 of the particles (every 3rd index). */
  accentColor?: string
  /** Pass-through style if the consumer wants to override absolute fill. */
  style?: StyleProp<ViewStyle>
}

interface ParticleSpec {
  key: number
  x: number
  y: number
  phase: number
  size: number
  color: string
}

const WAVE_DURATION_MS = 4500
const Y_AMPLITUDE = 14
const X_AMPLITUDE = 6
const OPACITY_PEAK = 0.5

/**
 * Continuous-loop particle field for hero cards.
 *
 * Why a single shared wave (not N timers)
 * ---------------------------------------
 * Each particle gets a phase offset derived from its index, then the
 * worklet computes its own sub-wave from the SHARED `wave` value:
 *
 *     particleWave = (wave.value + spec.phase) % 1
 *
 * One Reanimated driver runs the loop; N particles read from it.
 * Originally we considered one SharedValue per particle (N drivers),
 * which would have meant up to 24 worklets running across the 3 hero
 * cards mounted simultaneously. With this pattern, it's 3 (one per
 * card). Battery + GPU savings are non-trivial; the visual is
 * indistinguishable because the phase offsets desync the field.
 *
 * Pattern borrowed from `ParticleField` in
 * `mobile/components/control-v2/control-v2-hoy-card.tsx`, which
 * already uses the same shared-wave + per-particle-phase technique.
 *
 * Mounting requirements
 * ---------------------
 *  - Parent should have `overflow: 'hidden'` so particles don't leak
 *    past the card's bounding box.
 *  - The component renders `position: absolute` filling its parent;
 *    z-index should land between the card's background (gradient,
 *    base color) and its content (text, controls).
 *  - `pointerEvents: 'none'` so the particles never block taps on
 *    the card.
 *
 * Reduced motion
 * --------------
 * `useLoopAnimation` skips `start()` when reduce-motion is on, leaving
 * `wave` at 0. Every particle's worklet style returns `opacity: 0` in
 * that branch — invisible field, zero CPU.
 */
export function CardParticles({
  count = 6,
  color = '#FFFBF2',
  accentColor,
  style,
}: CardParticlesProps) {
  const reduced = useReducedMotion()
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  )
  const wave = useSharedValue(0)

  // Single linear loop — wave goes 0 → 1 forever, particles read off
  // it via their phase offset. Linear easing is intentional: the
  // bell-curve opacity inside each Particle worklet does the
  // shaping, so the underlying timer just needs to be a steady ramp.
  useLoopAnimation(
    () => {
      wave.value = withRepeat(
        withTiming(1, { duration: WAVE_DURATION_MS, easing: Easing.linear }),
        -1,
        false,
      )
    },
    [wave],
  )

  // Deterministic layout — same positions across mounts, no
  // Math.random in render. Golden-ratio multipliers spread the
  // particles in a quasi-random pattern that doesn't look like a
  // grid. Phase offsets desync the field so the bell-curves never
  // peak in unison.
  const specs = useMemo<ParticleSpec[]>(() => {
    if (!size) return []
    const out: ParticleSpec[] = []
    for (let i = 0; i < count; i++) {
      const ax = (i * 0.382 + 0.1) % 1
      const ay = (i * 0.618 + 0.05) % 1
      out.push({
        key: i,
        x: ax * size.width,
        y: ay * size.height,
        phase: (i * 0.137) % 1,
        size: 2 + (i % 3) * 0.6,
        color: i % 3 === 0 && accentColor ? accentColor : color,
      })
    }
    return out
  }, [size, count, color, accentColor])

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    if (!size || size.width !== width || size.height !== height) {
      setSize({ width, height })
    }
  }

  return (
    <View
      onLayout={onLayout}
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, style]}
    >
      {specs.map((spec) => (
        <Particle key={spec.key} spec={spec} wave={wave} reduced={reduced} />
      ))}
    </View>
  )
}

function Particle({
  spec,
  wave,
  reduced,
}: {
  spec: ParticleSpec
  wave: SharedValue<number>
  reduced: boolean
}) {
  const animated = useAnimatedStyle(() => {
    'worklet'
    if (reduced) {
      return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }] }
    }
    // Phase-shifted sub-wave: each particle is at a different point
    // in its bell-curve at any given frame.
    const t = (wave.value + spec.phase) % 1
    const phase = t * Math.PI
    return {
      opacity: Math.sin(phase) * OPACITY_PEAK,
      transform: [
        { translateX: Math.sin(phase * 2) * X_AMPLITUDE },
        { translateY: -Math.sin(phase) * Y_AMPLITUDE },
      ],
    }
  })

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: spec.x,
          top: spec.y,
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
          backgroundColor: spec.color,
          // Initial inline opacity: matches the worklet's value at
          // wave=0 (opacity = sin(spec.phase * π) * peak — close to 0
          // for low phases). This avoids the first-frame flicker where
          // the View paints with default opacity 1 before Reanimated
          // applies the worklet style. We use 0 for safety; the
          // worklet picks up on the next frame and corrects.
          opacity: 0,
        },
        animated,
      ]}
    />
  )
}
