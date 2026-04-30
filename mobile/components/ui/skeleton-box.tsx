import { type DimensionValue, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  useReducedMotion,
  Easing,
} from 'react-native-reanimated'
import { useLoopAnimation } from '@/hooks/use-loop-animation'
import { decorativeDurations } from '@/lib/motion'
import { useAppTheme } from '@/theme/theme-provider'

interface SkeletonBoxProps {
  width?: DimensionValue
  height?: number
  radius?: number
  style?: StyleProp<ViewStyle>
}

export function SkeletonBox({
  width = '100%',
  height = 16,
  radius = 8,
  style,
}: SkeletonBoxProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(0)

  // useLoopAnimation handles cancelAnimation on blur/unmount and the
  // reduced-motion fallback (parks at rest). We just describe the loop.
  useLoopAnimation(
    () => {
      progress.value = withRepeat(
        withTiming(1, {
          duration: decorativeDurations.shimmer,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        false,
      )
    },
    [progress],
  )

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion
      ? 0.6
      : interpolate(progress.value, [0, 0.5, 1], [0.45, 0.85, 0.45]),
  }))

  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: theme.colors.surfaceMuted,
        },
        animatedStyle,
        style,
      ]}
    />
  )
}
