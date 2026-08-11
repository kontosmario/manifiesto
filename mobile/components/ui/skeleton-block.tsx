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
import { NeoSkeleton, type SkeletonSkin } from '@/components/ui/neo-skeleton'
import { useLoopAnimation } from '@/hooks/use-loop-animation'
import { withAlpha } from '@/theme/color-utils'
import { useAppTheme } from '@/theme/theme-provider'

interface SkeletonBlockProps {
  height: number
  radius?: number
  style?: StyleProp<ViewStyle>
  width?: number | `${number}%`
  skin?: SkeletonSkin
}

export function SkeletonBlock({ skin = 'classic', ...props }: SkeletonBlockProps) {
  if (skin === 'neo') {
    return <NeoSkeleton {...props} />
  }
  return <ClassicSkeletonBlock {...props} />
}

// Skeleton shimmer block. Migrated from RN core `Animated` to
// Reanimated v4 (UI-thread loop) so the pulse runs on the compositor
// and pauses automatically on blur/unmount via `useLoopAnimation`.
function ClassicSkeletonBlock({
  height,
  radius = 14,
  style,
  width = '100%',
}: Omit<SkeletonBlockProps, 'skin'>) {
  const { theme } = useAppTheme()
  const pulse = useSharedValue(0.72)

  useLoopAnimation(
    () => {
      const ease = Easing.inOut(Easing.quad)
      pulse.value = withRepeat(
        withSequence(
          // @motion-allow: 820ms skeleton shimmer half-cycle; calmer than pulse (1200) so loaders don't compete with content
          withTiming(1, { duration: 820, easing: ease }),
          // @motion-allow: 820ms skeleton shimmer half-cycle; calmer than pulse (1200) so loaders don't compete with content
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
