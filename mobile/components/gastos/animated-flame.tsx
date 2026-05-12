import { Platform, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { useLoopAnimation } from '@/hooks/use-loop-animation'

// Reanimated v4 has partial web support — `withRepeat(withSequence(...))`
// chains with irregular timings run on rAF in the JS thread and tend
// to desync, drop frames and skip keyframes under load. The result on
// web is a flame that reads visually different from native (the
// "breathing" looks dead, the "flicker" looks janky).
//
// To match the project's established pattern (see RiseView fix from
// 2026-05-09: web renders a flat View without entering keyframes),
// every flame loop short-circuits on web and parks shared values at
// their neutral/static state. Web users still see the colored flame
// SVG + badge — they just don't get the motion. iOS / Android keep
// the full breathing + flicker + dance + pulse + dim loops.
const IS_WEB = Platform.OS === 'web'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type FlameStatus = 'active' | 'at_risk' | 'broken'

interface AnimatedFlameProps {
  status: FlameStatus
  /** Width of the SVG (height matches — 1:1 viewBox ratio). */
  size?: number
}

// ─────────────────────────────────────────────────────────────
// Palette per status — the component is theme-agnostic; every
// color needed lives here so callers only pass status + size.
// ─────────────────────────────────────────────────────────────

export const FLAME_PALETTE = {
  // V1 active flame — primary mint family from saturated to pastel.
  active: {
    outer: '#3DB319',         // primary-600
    outerBase: '#329315',     // primary-700
    inner: '#77E755',         // primary-400
    core: '#D1F7C5',          // primary-200
    ring: 'rgba(73,214,31,0.18)',
  },
  // V1 at-risk flame — accent coral family + butter core (kept) for
  // the warm "running out of fuel" feel.
  at_risk: {
    outer: '#EC7A51',         // accent-400
    outerBase: '#973511',     // accent-700
    inner: '#F8D1C3',         // accent-200
    core: '#FFF9C4',          // butter — semantic warning yellow core
    ring: 'rgba(236,122,81,0.22)',
  },
  // Broken — neutral grey ramp (no brand colour, intentional).
  broken: {
    outer: '#5A5A5A',
    outerBase: '#3A3A3A',
    inner: '#6A6A6A',
    core: '#8A8A8A',
    ring: 'transparent',
  },
} as const

// Flame path — viewBox "0 0 16 16", from flame-svgrepo-com.svg.
const PATH_FLAME =
  'M9.13 15l-.53-.77a1.85 1.85 0 0 0-.28-2.54 3.51 3.51 0 0 1-1.19-2c-1.56 2.23-.75 3.46 0 4.55l-.55.76A4.4 4.4 0 0 1 3 10.46S2.79 8.3 5.28 6.19c0 0 2.82-2.61 1.84-4.54L7.83 1a6.57 6.57 0 0 1 2.61 6.94 2.57 2.57 0 0 0 .56-.81l.87-.07c.07.12 1.84 2.93.89 5.3A4.72 4.72 0 0 1 9.13 15zm-2-6.95l.87.39a3 3 0 0 0 .92 2.48 2.64 2.64 0 0 1 1 2.8A3.241 3.241 0 0 0 11.8 12a4.87 4.87 0 0 0-.41-3.63 1.85 1.85 0 0 1-1.84.86l-.35-.68a5.31 5.31 0 0 0-.89-5.8C8.17 4.87 6 6.83 5.93 6.94 3.86 8.7 4 10.33 4 10.4a3.47 3.47 0 0 0 1.59 3.14C5 12.14 5 10.46 7.16 8.05h-.03z'

// ─────────────────────────────────────────────────────────────
// Animation hooks (Reanimated v4 — UI-thread worklets)
// ─────────────────────────────────────────────────────────────
//
// Migrated from RN core `Animated` to Reanimated v4 so the flame
// drives every frame on the UI runtime (no JS↔native bridge calls)
// and integrates with `useLoopAnimation`, which auto-cancels every
// `withRepeat` chain on blur/unmount and respects reduced motion.

interface BreathValues {
  scaleX: ReturnType<typeof useSharedValue<number>>
  scaleY: ReturnType<typeof useSharedValue<number>>
  translateY: ReturnType<typeof useSharedValue<number>>
}

function useBreath(status: FlameStatus): BreathValues {
  const scaleX = useSharedValue(1)
  const scaleY = useSharedValue(1)
  const translateY = useSharedValue(0)

  useLoopAnimation(
    () => {
      // Web: skip the loop entirely. Reanimated v4's withRepeat +
      // withSequence chain doesn't replicate cleanly on web rAF.
      if (IS_WEB || status === 'broken') {
        scaleX.value = 1
        scaleY.value = 1
        translateY.value = 0
        return
      }
      const duration = status === 'active' ? 2800 : 1600
      const sx = status === 'active' ? 1.04 : 1.06
      const sy = status === 'active' ? 1.07 : 1.09
      const ty = status === 'active' ? -3 : -4
      const ease = Easing.inOut(Easing.ease)

      const step = (v: number, ms: number) =>
        withTiming(v, { duration: ms, easing: ease })

      scaleX.value = withRepeat(
        withSequence(
          step(sx, duration * 0.4),
          step(0.97, duration * 0.3),
          step(1, duration * 0.3),
        ),
        -1,
        false,
      )
      scaleY.value = withRepeat(
        withSequence(
          step(sy, duration * 0.4),
          step(1.03, duration * 0.3),
          step(1, duration * 0.3),
        ),
        -1,
        false,
      )
      translateY.value = withRepeat(
        withSequence(
          step(ty, duration * 0.4),
          step(-1, duration * 0.3),
          step(0, duration * 0.3),
        ),
        -1,
        false,
      )
    },
    [scaleX, scaleY, translateY],
    [status],
  )

  return { scaleX, scaleY, translateY }
}

function useFlicker(status: FlameStatus) {
  const opacity = useSharedValue(1)

  useLoopAnimation(
    () => {
      // Web: park at static opacity (no flicker on the JS thread).
      // The flame still reads as "alive" via the colored palette.
      if (IS_WEB || status !== 'at_risk') {
        opacity.value = status === 'broken' ? 0.55 : 1
        return
      }
      // Irregular flicker pattern — six steps with mixed timings.
      opacity.value = withRepeat(
        withSequence(
          // @motion-allow: irregular flame-flicker pattern, intentional non-uniform durations
          withTiming(0.75, { duration: 180 }),
          // @motion-allow: irregular flame-flicker pattern, intentional non-uniform durations
          withTiming(1, { duration: 360 }),
          // @motion-allow: irregular flame-flicker pattern, intentional non-uniform durations
          withTiming(0.6, { duration: 150 }),
          // @motion-allow: irregular flame-flicker pattern, intentional non-uniform durations
          withTiming(0.95, { duration: 300 }),
          // @motion-allow: irregular flame-flicker pattern, intentional non-uniform durations
          withTiming(0.7, { duration: 120 }),
          // @motion-allow: irregular flame-flicker pattern, intentional non-uniform durations
          withTiming(1, { duration: 500 }),
        ),
        -1,
        false,
      )
    },
    [opacity],
    [status],
  )

  return opacity
}

function useInnerDance(status: FlameStatus): BreathValues {
  const scaleX = useSharedValue(1)
  const scaleY = useSharedValue(1)
  const translateY = useSharedValue(0)

  useLoopAnimation(
    () => {
      // Web: park inner flame at identity (no dance on rAF).
      if (IS_WEB || status === 'broken') {
        scaleX.value = 1
        scaleY.value = 1
        translateY.value = 0
        return
      }
      const duration = status === 'active' ? 2800 : 1300
      const ease = Easing.inOut(Easing.ease)
      const step = (v: number, ms: number) =>
        withTiming(v, { duration: ms, easing: ease })

      scaleX.value = withRepeat(
        withSequence(
          step(1.08, duration * 0.35),
          step(0.93, duration * 0.3),
          step(1, duration * 0.35),
        ),
        -1,
        false,
      )
      scaleY.value = withRepeat(
        withSequence(
          step(0.94, duration * 0.35),
          step(1.06, duration * 0.3),
          step(1, duration * 0.35),
        ),
        -1,
        false,
      )
      translateY.value = withRepeat(
        withSequence(
          step(2, duration * 0.35),
          step(-2, duration * 0.3),
          step(0, duration * 0.35),
        ),
        -1,
        false,
      )
    },
    [scaleX, scaleY, translateY],
    [status],
  )

  return { scaleX, scaleY, translateY }
}

function usePulseRing(status: FlameStatus) {
  const scale = useSharedValue(1)
  const opacity = useSharedValue(0.6)

  useLoopAnimation(
    () => {
      // Web: hide the ring entirely (a static visible ring would
      // sit permanently and read like a UI bug).
      if (IS_WEB || status === 'broken') {
        scale.value = 1
        opacity.value = 0
        return
      }
      const duration = status === 'active' ? 2400 : 1400
      const ease = Easing.out(Easing.ease)
      scale.value = withRepeat(withTiming(1.2, { duration, easing: ease }), -1, false)
      opacity.value = withRepeat(withTiming(0, { duration, easing: ease }), -1, false)
    },
    [scale, opacity],
    [status],
  )

  return { scale, opacity }
}

function useDimPulse(status: FlameStatus) {
  const opacity = useSharedValue(1)

  useLoopAnimation(
    () => {
      // Web: broken flame stays at a fixed dim opacity (no pulse).
      if (IS_WEB) {
        opacity.value = status === 'broken' ? 0.45 : 1
        return
      }
      if (status !== 'broken') {
        opacity.value = 1
        return
      }
      const ease = Easing.inOut(Easing.ease)
      opacity.value = withRepeat(
        withSequence(
          // @motion-allow: 2000ms broken-flame dim pulse half-cycle; reads slower than pulseSlow (2400) by design
          withTiming(0.55, { duration: 2000, easing: ease }),
          // @motion-allow: 2000ms broken-flame dim pulse half-cycle; reads slower than pulseSlow (2400) by design
          withTiming(0.35, { duration: 2000, easing: ease }),
        ),
        -1,
        false,
      )
    },
    [opacity],
    [status],
  )

  return opacity
}

// ─────────────────────────────────────────────────────────────
// Flame SVG — static path, wrappers handle transforms.
// ─────────────────────────────────────────────────────────────

interface FlamePalette {
  outer: string
  outerBase: string
  inner: string
  core: string
  ring: string
}

function FlameSVG({
  palette,
  width,
  height,
  flicker,
  innerDance,
  dimPulse,
}: {
  palette: FlamePalette
  width: number
  height: number
  flicker: ReturnType<typeof useSharedValue<number>>
  innerDance: BreathValues
  dimPulse: ReturnType<typeof useSharedValue<number>>
}) {
  const dimStyle = useAnimatedStyle(() => ({ opacity: dimPulse.value }))
  const flickerStyle = useAnimatedStyle(() => ({ opacity: flicker.value }))
  const innerStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleX: innerDance.scaleX.value },
      { scaleY: innerDance.scaleY.value },
      { translateY: innerDance.translateY.value },
    ],
  }))

  return (
    <Animated.View style={dimStyle}>
      <Animated.View style={flickerStyle}>
        <Svg viewBox="0 0 16 16" width={width} height={height}>
          <Path d={PATH_FLAME} fill={palette.outerBase} />
          <Path d={PATH_FLAME} fill={palette.outer} opacity={0.92} />
        </Svg>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, innerStyle]}>
        <Svg viewBox="0 0 16 16" width={width} height={height}>
          <Path d={PATH_FLAME} fill={palette.inner} opacity={0.7} />
          <Path d={PATH_FLAME} fill={palette.core} opacity={0.75} />
        </Svg>
      </Animated.View>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────────────────────
// Public component — just the flame + aura ring. Badge/container
// chrome is handled by the caller so it can adapt to the theme.
// ─────────────────────────────────────────────────────────────

export function AnimatedFlame({ status, size = 42 }: AnimatedFlameProps) {
  const palette = FLAME_PALETTE[status]
  const breath = useBreath(status)
  const flicker = useFlicker(status)
  const innerDance = useInnerDance(status)
  const ring = usePulseRing(status)
  const dimPulse = useDimPulse(status)

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ring.scale.value }],
    opacity: ring.opacity.value,
  }))
  const flameWrapStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleX: breath.scaleX.value },
      { scaleY: breath.scaleY.value },
      { translateY: breath.translateY.value },
    ],
  }))

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          {
            width: size * 0.95,
            height: size * 0.95,
            borderRadius: size * 0.475,
            backgroundColor: palette.ring,
          },
          ringStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.flameWrap,
          {
            width: size,
            height: size,
          },
          flameWrapStyle,
        ]}
      >
        <FlameSVG
          palette={palette}
          width={size}
          height={size}
          flicker={flicker}
          innerDance={innerDance}
          dimPulse={dimPulse}
        />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ring: {
    position: 'absolute',
    alignSelf: 'center',
  },
  flameWrap: {
    position: 'relative',
  },
})
