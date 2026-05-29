import { Platform, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useLoopAnimation } from '@/hooks/use-loop-animation'

// Web parity: Reanimated v4's withRepeat loops run on rAF in the JS
// thread and tend to desync/jank. Match the established flame pattern
// (see animated-flame.tsx): on web park the breath at its settled
// mid-state so the bloom still reads, just without the loop.
const IS_WEB = Platform.OS === 'web'

interface AuroraBloomProps {
  /** Base color of the bloom (tint). */
  color: string
  /** Diameter in px of the largest layer. */
  size: number
  /** Max opacity of the bloom (default ~0.5). */
  intensity?: number
  /** Disable the breathing loop (static). */
  still?: boolean
}

// Concentric layer geometry: each layer is a fraction of the largest
// diameter, with the inner layers brighter. Stacking low-opacity fills
// (no shadows) gives a soft, neon-free bloom that leans on the natural
// edge softness of overlapping translucent circles.
const LAYERS = [
  { scale: 1.0, opacityMul: 0.35 }, // widest, faintest halo
  { scale: 0.66, opacityMul: 0.6 }, // mid
  { scale: 0.38, opacityMul: 1.0 }, // inner core, brightest
] as const

// One full breath cycle is ~3500ms (slow, low-amplitude). The single
// shared value drives both scale (1.0 ↔ 1.12) and opacity (0.7 ↔ 1.0
// of the per-layer base) so only transform + opacity hit the GPU path.
const BREATH_MS = 3500

/**
 * A soft, perpetual radial bloom built from layered translucent
 * `<View>` circles (no SVG gradients, no shadows — sidesteps the
 * react-native-svg gradient typing pitfall and avoids hard neon).
 *
 * The bloom breathes infinitely on a single shared value, auto-cancels
 * on blur/unmount via `useLoopAnimation`, and parks at a settled
 * mid-state under reduced motion, `still`, or on web.
 */
export function AuroraBloom({
  color,
  size,
  intensity = 0.5,
  still = false,
}: AuroraBloomProps) {
  // breath: 0 → 1 → 0 … drives scale + opacity via interpolation in the
  // worklet. Parked at 0.5 (settled mid) when static.
  const breath = useSharedValue(0.5)

  useLoopAnimation(
    () => {
      if (IS_WEB || still) {
        breath.value = 0.5
        return
      }
      const ease = Easing.inOut(Easing.ease)
      breath.value = withRepeat(
        withSequence(
          withTiming(1, { duration: BREATH_MS * 0.5, easing: ease }),
          withTiming(0, { duration: BREATH_MS * 0.5, easing: ease }),
        ),
        -1,
        false,
      )
    },
    [breath],
    [still],
  )

  const breathStyle = useAnimatedStyle(() => {
    // breath 0→1 maps to scale 1.0→1.12 and an opacity factor 0.7→1.0.
    const scale = 1 + breath.value * 0.12
    const opacityFactor = 0.7 + breath.value * 0.3
    return {
      transform: [{ scale }],
      opacity: opacityFactor,
    }
  })

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.root, { width: size, height: size }, breathStyle]}
    >
      {LAYERS.map((layer, i) => {
        const d = size * layer.scale
        return (
          <View
            key={i}
            style={[
              styles.layer,
              {
                width: d,
                height: d,
                borderRadius: d / 2,
                backgroundColor: color,
                opacity: intensity * layer.opacityMul,
              },
            ]}
          />
        )
      })}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  layer: {
    position: 'absolute',
  },
})
