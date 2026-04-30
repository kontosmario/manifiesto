import {
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useLoopAnimation } from '@/hooks/use-loop-animation'
import { withAlpha } from '@/theme/color-utils'
import { useAppTheme } from '@/theme/theme-provider'

interface SkeletonBlockProps {
  height: number
  radius?: number
  style?: StyleProp<ViewStyle>
  width?: number | `${number}%`
}

// Skeleton shimmer block. Migrated from RN core `Animated` to
// Reanimated v4 (UI-thread loop) so the pulse runs on the compositor
// and pauses automatically on blur/unmount via `useLoopAnimation`.
export function SkeletonBlock({
  height,
  radius = 14,
  style,
  width = '100%',
}: SkeletonBlockProps) {
  const { theme } = useAppTheme()
  const pulse = useSharedValue(0.72)

  useLoopAnimation(
    () => {
      const ease = Easing.inOut(Easing.quad)
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 820, easing: ease }),
          withTiming(0.72, { duration: 820, easing: ease }),
        ),
        -1,
        false,
      )
    },
    [pulse],
  )

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }))

  return (
    <Animated.View
      style={[
        styles.block,
        {
          backgroundColor: withAlpha(
            theme.isDark ? theme.colors.textMuted : theme.colors.primary,
            theme.isDark ? 0.14 : 0.12,
          ),
          borderRadius: radius,
          height,
          width,
        },
        pulseStyle,
        style,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  block: {
    overflow: 'hidden',
  },
})
