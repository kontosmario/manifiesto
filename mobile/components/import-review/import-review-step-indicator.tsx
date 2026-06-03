import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useEffect, useRef } from 'react'
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
 * On `current → done` transition the segment briefly swells + flashes
 * to ack the forward motion. Subtle but enough that a confused user
 * gets a "yep, I just moved forward" signal beyond the slide animation.
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
  // Brief celebratory bump when the segment transitions from "current"
  // to "done". Combined with the slide-in of the next step it tells the
  // user "this one's locked in" — confidence-building for the timid.
  const advancePulse = useSharedValue(0)
  const prevStatusRef = useRef<StepStatus>(status)

  useEffect(() => {
    fillProgress.value = withTiming(toFill(status), {
      duration: motionDurations.quick,
      easing: EASE_IOS,
    })
    heightProgress.value = withTiming(status === 'current' ? 1 : 0, {
      duration: motionDurations.quick,
      easing: EASE_IOS,
    })

    if (prevStatusRef.current === 'current' && status === 'done') {
      advancePulse.value = withSequence(
        withTiming(1, {
          duration: motionDurations.micro,
          easing: EASE_IOS,
        }),
        withTiming(0, {
          duration: motionDurations.standard,
          easing: EASE_IOS,
        }),
      )
    }
    prevStatusRef.current = status
  }, [status, fillProgress, heightProgress, advancePulse])

  const animatedStyle = useAnimatedStyle(() => ({
    // 4px when inactive, 6px when current, briefly 8px on advance pulse.
    height: 4 + heightProgress.value * 2 + advancePulse.value * 2,
    opacity: Math.min(1, 0.35 + fillProgress.value * 0.65 + advancePulse.value * 0.3),
  }))

  const color = (() => {
    switch (status) {
      case 'invalid':
        return theme.colors.danger
      case 'skipped':
        // Warning tint reads as "intentional omission" — louder than a
        // muted gray, softer than danger red. User wants the strip to
        // reflect skipped reality, not whisper it.
        return theme.colors.warning
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
    case 'skipped':
      // Full opacity for skipped — the warning color is doing the
      // semantic work; muting it would dilute the "this one's out"
      // signal the user explicitly asked for.
      return 1
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
