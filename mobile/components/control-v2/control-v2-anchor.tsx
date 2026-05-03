import { useEffect, type PropsWithChildren } from 'react'
import { View, type LayoutChangeEvent, type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useControlAnchors } from '@/features/insights/control-section-anchors'
import type { ControlSectionAnchor } from '@/features/insights/control-action'
import { motionDurations, motionEasings } from '@/lib/motion/tokens'

interface ControlV2AnchorProps extends PropsWithChildren {
  section: ControlSectionAnchor
  style?: ViewStyle
}

/**
 * Wraps a Control section so it:
 *   1. Registers its vertical offset in the anchor context on layout.
 *   2. Pulses a subtle scale + glow when the dispatcher targets it
 *      (via `ControlAction: { kind: 'scroll-to-section' }`).
 *
 * The pulse lives for ~900ms then fades, so the user gets a clear
 * "landed here" cue after the scroll completes without needing to
 * hunt for which block the Asistente pointed to.
 */
export function ControlV2Anchor({
  section,
  style,
  children,
}: ControlV2AnchorProps) {
  const { registerOffset, pulsingSection } = useControlAnchors()
  const pulse = useSharedValue(0)

  useEffect(() => {
    if (pulsingSection !== section) return
    pulse.value = 0
    pulse.value = withSequence(
      withTiming(1, { duration: motionDurations.exitModal, easing: motionEasings.decelerate }),
      withRepeat(
        withSequence(
          withTiming(0.3, { duration: motionDurations.scrimIn, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.9, { duration: motionDurations.scrimIn, easing: Easing.inOut(Easing.sin) }),
        ),
        2,
        false,
      ),
      withTiming(0, { duration: motionDurations.standard, easing: motionEasings.exitStandard }),
    )
    // The pulse is bounded (~1s total), but if the user navigates
    // away mid-pulse the worklet driver should be torn down to free
    // the UI runtime allocation.
    return () => {
      cancelAnimation(pulse)
    }
  }, [pulsingSection, section, pulse])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.008 * pulse.value }],
    shadowOpacity: 0.25 * pulse.value,
  }))

  const handleLayout = (event: LayoutChangeEvent) => {
    // `y` here is relative to the parent — the screen passes down a
    // ScrollView whose root View shares coords, so this is the offset
    // the ScrollView can seek to.
    registerOffset(section, event.nativeEvent.layout.y)
  }

  return (
    <View onLayout={handleLayout} style={style}>
      <Animated.View
        style={[
          {
            shadowColor: '#A6EF8F',
            shadowOffset: { width: 0, height: 0 },
            shadowRadius: 20,
            shadowOpacity: 0,
          },
          animatedStyle,
        ]}
      >
        {children}
      </Animated.View>
    </View>
  )
}
