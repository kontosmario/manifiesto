import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useEffect } from 'react'
import { motionDurations } from '@/lib/motion/tokens'
import { useAppTheme } from '@/theme/theme-provider'

export type StepStatus = 'pending' | 'current' | 'done' | 'invalid' | 'skipped'

interface Props {
  /** One entry per movement — drives width and the filled/pending split. */
  statuses: readonly StepStatus[]
}

const EASE_IOS = Easing.bezier(0.32, 0.72, 0, 1)

/**
 * Thin progress strip: one segment per movement. We deliberately keep
 * the visual language to TWO ideas — "handled" (filled, brand tint) vs
 * "still ahead" (muted) — plus a single red flag for an invalid row,
 * which is the only status that needs the user to act. The old five-color
 * scheme (done / skipped / current each its own hue, plus an advance
 * pulse) made the user learn a legend for something the "Movimiento N de
 * M" header and the slide already communicate. Less to decode, same
 * orientation.
 */
export function ImportReviewStepIndicator({ statuses }: Props) {
  if (statuses.length <= 1) return null
  return (
    <View style={styles.row}>
      {statuses.map((s, idx) => (
        <Segment key={idx} status={s} />
      ))}
    </View>
  )
}

function Segment({ status }: { status: StepStatus }) {
  const { theme } = useAppTheme()
  const filled = status !== 'pending'
  const opacity = useSharedValue(filled ? 1 : 0.4)

  useEffect(() => {
    opacity.value = withTiming(filled ? 1 : 0.4, {
      duration: motionDurations.quick,
      easing: EASE_IOS,
    })
  }, [filled, opacity])

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  // Only two colors carry meaning: red = "fix me", brand tint = "handled".
  // Pending segments ride the muted line color at low opacity so the
  // filled/pending boundary itself reads as progress.
  const color =
    status === 'invalid'
      ? theme.colors.danger
      : status === 'pending'
        ? theme.colors.line
        : theme.colors.primary

  return (
    <Animated.View
      style={[styles.segment, animatedStyle, { backgroundColor: color }]}
    />
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 999,
  },
})
