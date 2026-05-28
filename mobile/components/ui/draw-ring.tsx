import { useEffect } from 'react'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

// `Circle` doesn't suffer the children-typing problem that
// Defs/LinearGradient/Stop do, so wrapping it with
// createAnimatedComponent is safe (same pattern as fern-logo's
// AnimatedPath).
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

interface DrawRingProps {
  /** Outer diameter in px. */
  size: number
  /** Stroke width in px. */
  strokeWidth: number
  /** Ring color. */
  color: string
  /** Target fraction to draw, 0..1 (default 1 = full circle). */
  progress?: number
  /** Optional faint track color behind the drawn arc. */
  trackColor?: string
  /** Draw duration ms (default 900). */
  duration?: number
  /** Delay before drawing ms (default 120). */
  delay?: number
}

// Expo-out curve — fast take-off, soft settle. Matches the draw curve
// used elsewhere (fern stem trace, level fill).
const DRAW_EASE = Easing.bezier(0.16, 1, 0.3, 1)

/**
 * An SVG ring that draws itself once on mount via animated
 * `strokeDashoffset`. Starts at 12 o'clock (rotated -90°) and sweeps
 * clockwise to `progress`. Reduced motion renders the final drawn
 * state immediately (no animation). `pointerEvents="none"`.
 */
export function DrawRing({
  size,
  strokeWidth,
  color,
  progress = 1,
  trackColor,
  duration = 900,
  delay = 120,
}: DrawRingProps) {
  const reduced = useReducedMotion()

  // Geometry computed in JS (never inside a worklet).
  const clamped = Math.min(Math.max(progress, 0), 1)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2
  // Final offset when fully drawn to `progress`: the visible arc length
  // is circumference * progress, so the hidden remainder is the offset.
  const targetOffset = circumference * (1 - clamped)

  // draw: 0 (empty, offset = circumference) → 1 (drawn, offset =
  // targetOffset). Seed at final state under reduced motion.
  const draw = useSharedValue(reduced ? 1 : 0)

  useEffect(() => {
    if (reduced) {
      draw.value = 1
      return
    }
    draw.value = 0
    draw.value = withDelay(
      delay,
      withTiming(1, { duration, easing: DRAW_EASE }),
    )
    return () => {
      cancelAnimation(draw)
    }
  }, [reduced, delay, duration, clamped, draw])

  const animatedProps = useAnimatedProps(() => {
    // offset interpolates from full circumference (empty) to
    // targetOffset (drawn to progress) as draw goes 0→1.
    const offset = circumference - (circumference - targetOffset) * draw.value
    return { strokeDashoffset: offset }
  })

  return (
    <Svg width={size} height={size} pointerEvents="none">
      {trackColor ? (
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
      ) : null}
      <AnimatedCircle
        cx={center}
        cy={center}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={circumference}
        // Start the sweep at 12 o'clock instead of 3 o'clock.
        transform={`rotate(-90 ${center} ${center})`}
        animatedProps={animatedProps}
      />
    </Svg>
  )
}
