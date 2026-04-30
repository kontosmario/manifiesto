import { type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useLoopAnimation } from '@/hooks/use-loop-animation'

interface FloatViewProps {
  amplitude?: number
  periodMs?: number
  style?: ViewStyle
  children: React.ReactNode
}

export function FloatView({ amplitude = 6, periodMs = 3000, style, children }: FloatViewProps) {
  const y = useSharedValue(0)
  // `useLoopAnimation` parks the loop on blur/unmount and respects
  // reduced motion automatically — no manual cancelAnimation needed.
  useLoopAnimation(
    () => {
      y.value = withRepeat(
        withSequence(
          withTiming(-amplitude, { duration: periodMs / 2, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: periodMs / 2, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      )
    },
    [y],
    [amplitude, periodMs],
  )
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }))
  return <Animated.View style={[style, a]}>{children}</Animated.View>
}
