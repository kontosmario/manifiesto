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
import { useUnboundedLoopAnimation } from '@/hooks/use-unbounded-loop-animation'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface CardParticlesProps {
  /** Particle count. 4–12 typical. Default 6. */
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
  /** Integer frequency multiplier for x motion — 1 or 2. */
  fx: number
  /** Integer frequency multiplier for y motion — 1 or 2. */
  fy: number
  /** Integer frequency multiplier for brightness flicker — 1, 2 or 3. */
  fb: number
  /** Phase offset for x motion (radians, 0..2π). */
  phaseX: number
  phaseY: number
  phaseB: number
  /** Per-particle amplitudes — slightly varied so the field doesn't pulse in sync. */
  ampX: number
  ampY: number
  /** Brightness ceiling for this particle. */
  brightCeil: number
  size: number
  color: string
}

// 10s wave period gives a meditative, slow drift. Because every motion
// formula uses an integer frequency multiplier of `wave * 2π`, sin/cos
// values at wave=0 and wave=1 are identical — no position OR velocity
// jump at the loop boundary. The visible "salto" the audit reported
// came from `position = drift * t` (linear ramp + modulo) which we
// no longer use.
const WAVE_DURATION_MS = 10_000

const X_AMPLITUDE_BASE = 12
const Y_AMPLITUDE_BASE = 16

// Brightness floor + peak. Floor > 0 so fireflies never fully blink off
// (true fireflies pulse — they don't strobe). Peak bumped from 0.5 → 0.92
// for the "que brillen un poco más" requirement.
const BRIGHT_FLOOR = 0.18
const BRIGHT_PEAK = 0.92

/**
 * Continuous-flow particle field for hero cards.
 *
 * Firefly motion model
 * --------------------
 * Each particle uses three integer-multiplier sine waves driven by a
 * single shared `wave: 0 → 1 → 0…` SharedValue:
 *
 *     x_offset    = sin(2π·fx·wave + phaseX) · ampX
 *     y_offset    = sin(2π·fy·wave + phaseY) · ampY
 *     brightness  = (sin(2π·fb·wave + phaseB) + 1) / 2
 *
 * Because `fx`, `fy`, `fb` are positive integers, each sin/cos is
 * periodic with the wave's period — so when `wave` snaps from 1 → 0
 * via `withRepeat`, every particle's position AND velocity match
 * across the wrap. No visible kink.
 *
 * Mixing `fx ∈ {1,2}`, `fy ∈ {1,2}`, `fb ∈ {1,2,3}` per particle gives
 * a non-trivial Lissajous-style trajectory that doesn't visually
 * close at the field's overall period (different particles loop at
 * different rates, desyncing the eye).
 *
 * Why a single shared wave (not N timers)
 * ---------------------------------------
 * One Reanimated driver runs the loop; N particles read from it.
 * Without this pattern, 24 particles across 3 mounted hero cards =
 * 24 worklets — wasteful and battery-hostile. With it, 3 (one per
 * card) drive the whole field.
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
 * `wave` at 0. The worklet returns a static-but-visible state at wave=0
 * (each particle at its anchor with mid-floor brightness) — not zero,
 * because fireflies that never glow look like dead pixels.
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

  // Hero-card particles must NEVER pause from the user's perspective.
  // Switched from `useLoopAnimation` (which cancels on `useIsFocused`
  // → false) to `useUnboundedLoopAnimation` (no focus gating).
  // Reason: with the Stack's `freezeOnBlur: true`, navigating away
  // from Home and back left the `wave` shared value cancelled and
  // not always restarted cleanly — users saw the firefly field
  // "frozen" until app restart. Decorative ambient motion is the
  // exact use-case where `useUnboundedLoopAnimation` exists.
  useUnboundedLoopAnimation(
    () => {
      wave.value = withRepeat(
        withTiming(1, { duration: WAVE_DURATION_MS, easing: Easing.linear }),
        -1,
        false,
      )
    },
    [wave],
  )

  // Deterministic layout — quasi-random spread (golden-ratio mods) plus
  // per-particle frequency/phase/amplitude variation so the field reads
  // chaotic without ever being random.
  const specs = useMemo<ParticleSpec[]>(() => {
    if (!size) return []
    const out: ParticleSpec[] = []
    const TWO_PI = Math.PI * 2
    for (let i = 0; i < count; i++) {
      const ax = (i * 0.382 + 0.1) % 1
      const ay = (i * 0.618 + 0.05) % 1
      // Mix 1 and 2 across particles. Picking by (i % …) so every
      // mount produces the same field.
      const fx = (i % 3 === 0 ? 2 : 1) as 1 | 2
      const fy = (i % 2 === 0 ? 1 : 2) as 1 | 2
      const fb = (1 + (i % 3)) as 1 | 2 | 3
      out.push({
        key: i,
        x: ax * size.width,
        y: ay * size.height,
        fx,
        fy,
        fb,
        // Phase offsets in radians. `0.137` is a small irrational-ish
        // step that desyncs neighbouring particles.
        phaseX: (i * 0.137) * TWO_PI,
        phaseY: (i * 0.211 + 0.3) * TWO_PI,
        phaseB: (i * 0.317 + 0.6) * TWO_PI,
        // Vary amplitudes ±20% so the field has a natural shimmer of
        // motion sizes.
        ampX: X_AMPLITUDE_BASE * (0.8 + ((i * 7) % 5) * 0.1),
        ampY: Y_AMPLITUDE_BASE * (0.8 + ((i * 11) % 5) * 0.1),
        // Larger particles glow a touch brighter at peak; smaller ones
        // hold a softer ceiling so they read as "background" twinkles.
        brightCeil: BRIGHT_PEAK - ((i % 4) * 0.06),
        size: 2.4 + (i % 3) * 0.8,
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
      // Static but visible — a faint always-on glow per particle,
      // matching the "fireflies that don't move when you ask them to
      // hold still" mental model.
      return {
        opacity: BRIGHT_FLOOR + 0.15,
        transform: [{ translateX: 0 }, { translateY: 0 }],
      }
    }
    const angle = wave.value * 2 * Math.PI
    const tx = Math.sin(angle * spec.fx + spec.phaseX) * spec.ampX
    const ty = Math.cos(angle * spec.fy + spec.phaseY) * spec.ampY
    // Brightness flicker — independent of motion, so the eye reads
    // "this firefly is breathing" rather than "the position drives
    // the brightness".
    const flicker01 = (Math.sin(angle * spec.fb + spec.phaseB) + 1) / 2
    const opacity =
      BRIGHT_FLOOR + flicker01 * (spec.brightCeil - BRIGHT_FLOOR)
    return {
      opacity,
      transform: [{ translateX: tx }, { translateY: ty }],
    }
  })

  // Glow halo — a static boxShadow sized roughly 4× the particle so the
  // dot reads as a soft point of light, not a hard pixel. Fades with
  // the view's opacity (RN >=0.76 supports boxShadow as a regular CSS
  // shadow that respects parent opacity).
  const glowRadius = spec.size * 2.5
  const glow = `0px 0px ${glowRadius.toFixed(1)}px ${spec.color}`

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
          // Inline opacity 0 prevents first-frame flash before the
          // worklet style applies on the next frame.
          opacity: 0,
          // Soft halo around the dot. Worklet animates the View's
          // overall opacity which dims the shadow with it.
          boxShadow: glow,
        },
        animated,
      ]}
    />
  )
}
