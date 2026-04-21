import { useEffect } from 'react'
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

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 0.5
      return
    }
    progress.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    )
  }, [progress, reduceMotion])

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
