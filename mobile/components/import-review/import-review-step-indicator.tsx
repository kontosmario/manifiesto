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
  /** One entry per movement — drives both width and per-segment color. */
  statuses: readonly StepStatus[]
}

const EASE_IOS = Easing.bezier(0.32, 0.72, 0, 1)

/**
 * Horizontal pill segments showing wizard progress. Each segment maps
 * 1:1 to a row in the import. Colors encode status so the user can
 * glance at the strip and see what's done, what's flagged, what's still
 * pending — no need to step through to find issues.
 *
 * Heights flatten/swell based on whether the segment is "current" so
 * the eye is pulled to the active step without leaning on color alone
 * (a11y-friendly).
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
  const fillProgress = useSharedValue(toFill(status))
  const heightProgress = useSharedValue(status === 'current' ? 1 : 0)

  useEffect(() => {
    fillProgress.value = withTiming(toFill(status), {
      duration: motionDurations.quick,
      easing: EASE_IOS,
    })
    heightProgress.value = withTiming(status === 'current' ? 1 : 0, {
      duration: motionDurations.quick,
      easing: EASE_IOS,
    })
  }, [status, fillProgress, heightProgress])

  const animatedStyle = useAnimatedStyle(() => ({
    // 4px when inactive, 6px when current — subtle swell to mark focus.
    height: 4 + heightProgress.value * 2,
    opacity: 0.35 + fillProgress.value * 0.65,
  }))

  const color = (() => {
    switch (status) {
      case 'invalid':
        return theme.colors.danger
      case 'skipped':
        return theme.colors.textMuted
      case 'done':
      case 'current':
        return theme.colors.primary
      case 'pending':
      default:
        return theme.colors.line
    }
  })()

  return (
    <Animated.View
      style={[
        styles.segment,
        animatedStyle,
        { backgroundColor: color },
      ]}
    />
  )
}

function toFill(status: StepStatus): number {
  switch (status) {
    case 'done':
    case 'current':
    case 'invalid':
      return 1
    case 'skipped':
      return 0.7
    case 'pending':
    default:
      return 0.4
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  segment: {
    flex: 1,
    borderRadius: 999,
  },
})
