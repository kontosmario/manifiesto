import { useEffect, useState } from 'react'
import {
  Animated,
  Easing,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { withAlpha } from '@/theme/color-utils'
import { USE_NATIVE_DRIVER } from '@/lib/runtime-environment'
import { useAppTheme } from '@/theme/theme-provider'

interface SkeletonBlockProps {
  height: number
  radius?: number
  style?: StyleProp<ViewStyle>
  width?: number | `${number}%`
}

export function SkeletonBlock({
  height,
  radius = 14,
  style,
  width = '100%',
}: SkeletonBlockProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const [pulse] = useState(() => new Animated.Value(0.72))

  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(1)
      return
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 820,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(pulse, {
          toValue: 0.72,
          duration: 820,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
    )

    animation.start()

    return () => {
      animation.stop()
    }
  }, [pulse, reduceMotion])

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
          opacity: pulse,
          width,
        },
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
