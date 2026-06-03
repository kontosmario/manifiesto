import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import {
  decorativeDurations,
  motionDurations,
  motionSprings,
} from '@/lib/motion/tokens'
import { withAlpha } from '@/theme/color-utils'

const EASE_IOS = Easing.bezier(0.32, 0.72, 0, 1)

export type ActionKey =
  | 'expense'
  | 'fixed'
  | 'income'
  | 'no-spend'
  | 'import'

interface Props {
  actionKey: ActionKey
  icon: keyof typeof MaterialIcons.glyphMap
  size: number
  color: string
  bgColor: string
  /** ms of delay before the signature animation runs. Lets the parent
   *  align icon choreography with the row's stagger reveal. */
  delay?: number
  /** When true, the icon plays its signature on mount; when false, it
   *  renders idle. Used so the overlay can replay each icon's intro on
   *  re-open without remounting. */
  active: boolean
}

/**
 * Renders an action icon with a per-key signature entrance animation
 * — each icon "introduces itself" the moment its row reveals, so a
 * user can identify the action by motion as much as by label:
 *
 *   • expense   "+" rotates -90° → 0° with a celebrate spring (the
 *               plus *lands* into place).
 *   • import    A thin accent-colored bar sweeps top-to-bottom across
 *               the icon once, like a real scanner pass.
 *   • income    Icon translates from +12y → 0y with overshoot — the
 *               trending-up arrow physically goes up.
 *   • no-spend  Leaf wiggles: 0° → -12° → +6° → -3° → 0°.
 *   • fixed     Loop rotates 360° once, mirroring the repeat icon's
 *               own glyph.
 *
 * Each animation lasts ~standard duration so it lands as the row
 * finishes settling. The whole choreography (across 5 rows) takes
 * under a second.
 */
export function AddQuickActionIcon({
  actionKey,
  icon,
  size,
  color,
  bgColor,
  delay = 0,
  active,
}: Props) {
  const rotate = useSharedValue(0)
  const translateY = useSharedValue(0)
  const scale = useSharedValue(1)
  const scanY = useSharedValue(-1) // -1 = above icon, +1 = below

  useEffect(() => {
    if (!active) {
      // Reset to idle without animation so a closed-then-reopened
      // overlay starts each icon from a clean state.
      rotate.value = 0
      translateY.value = 0
      scale.value = 1
      scanY.value = -1
      return
    }

    switch (actionKey) {
      case 'expense': {
        // "+" rotates into place. Starts -90 deg, scale 0.4, settles.
        rotate.value = -90
        scale.value = 0.4
        rotate.value = withDelay(
          delay,
          withTiming(0, {
            duration: motionDurations.deliberate,
            easing: EASE_IOS,
          }),
        )
        scale.value = withDelay(delay, withSpring(1, motionSprings.celebrate))
        break
      }
      case 'import': {
        // Scan bar sweeps across the icon once. -1 is above, +1 is
        // below. The bar is rendered as a sibling, positioned by scanY.
        scanY.value = -1
        scanY.value = withDelay(
          delay,
          withTiming(1, {
            duration: motionDurations.slow,
            easing: EASE_IOS,
          }),
        )
        break
      }
      case 'income': {
        // Arrow trends up from below with overshoot.
        translateY.value = 12
        scale.value = 0.85
        translateY.value = withDelay(
          delay,
          withSpring(0, motionSprings.celebrate),
        )
        scale.value = withDelay(delay, withSpring(1, motionSprings.celebrate))
        break
      }
      case 'no-spend': {
        // Leaf wiggle: -12 → +6 → -3 → 0. Quick, playful.
        rotate.value = 0
        rotate.value = withDelay(
          delay,
          withSequence(
            withTiming(-12, {
              duration: motionDurations.micro,
              easing: EASE_IOS,
            }),
            withTiming(6, {
              duration: motionDurations.quick,
              easing: EASE_IOS,
            }),
            withTiming(-3, {
              duration: motionDurations.quick,
              easing: EASE_IOS,
            }),
            withTiming(0, {
              duration: motionDurations.quick,
              easing: EASE_IOS,
            }),
          ),
        )
        break
      }
      case 'fixed': {
        // Full 360° rotation — mirrors the repeat icon's own glyph.
        rotate.value = 0
        rotate.value = withDelay(
          delay,
          withTiming(360, {
            duration: motionDurations.slow,
            easing: EASE_IOS,
          }),
        )
        break
      }
    }
  }, [active, actionKey, delay, rotate, translateY, scale, scanY])

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
  }))

  const scanStyle = useAnimatedStyle(() => ({
    // scanY ∈ [-1, 1] maps to translation across the icon height.
    transform: [{ translateY: scanY.value * size }],
    opacity: scanY.value > -0.95 && scanY.value < 0.95 ? 1 : 0,
  }))

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size + 16,
          height: size + 16,
          borderRadius: 999,
          backgroundColor: bgColor,
        },
      ]}
    >
      <Animated.View style={iconStyle}>
        <MaterialIcons name={icon} size={size} color={color} />
      </Animated.View>
      {actionKey === 'import' ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.scanBar,
            scanStyle,
            { backgroundColor: color, shadowColor: color },
          ]}
        />
      ) : null}
      {actionKey === 'expense' ? <ExpensePulseRing color={color} /> : null}
    </View>
  )
}

/**
 * A slow, low-opacity ambient pulse behind the primary "+" icon.
 * Subtle attention-pull on the default action — emil-style "the
 * thing you'll probably tap is gently breathing".
 */
function ExpensePulseRing({ color }: { color: string }) {
  const t = useSharedValue(0)

  useEffect(() => {
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: decorativeDurations.shimmer, easing: EASE_IOS }),
        withTiming(0, { duration: decorativeDurations.shimmer, easing: EASE_IOS }),
      ),
      -1,
      false,
    )
  }, [t])

  const style = useAnimatedStyle(() => ({
    opacity: 0.18 + 0.22 * t.value,
    transform: [{ scale: 0.95 + 0.15 * t.value }],
  }))

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pulseRing,
        style,
        { borderColor: withAlpha(color, 0.6) },
      ]}
    />
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  scanBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 999,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 6,
  },
  pulseRing: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 999,
    borderWidth: 2,
  },
})
