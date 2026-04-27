import { type ViewStyle } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated'
import { useLoopAnimation } from '@/hooks/use-loop-animation'

interface BreatheDotProps {
  size: number
  color: string
  glow?: string
  periodMs?: number
  style?: ViewStyle
}

export function BreatheDot({ size, color, glow, periodMs = 1800, style }: BreatheDotProps) {
  const s = useSharedValue(1)
  useLoopAnimation(
    () => {
      s.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: periodMs / 2, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: periodMs / 2, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      )
    },
    [s],
    [periodMs],
  )
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }))
  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          // boxShadow is the cross-platform API (React Native 0.76+ / RN-web 0.21+)
          // that replaces the deprecated shadow* props.
          boxShadow: glow ? `0 0 ${size * 0.8}px ${glow}` : undefined,
        },
        style,
        a,
      ]}
    />
  )
}
