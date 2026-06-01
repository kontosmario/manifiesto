import { useEffect, useRef, useState } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { BlurView } from 'expo-blur'
import { MaterialIcons } from '@expo/vector-icons'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import {
  motionDurations,
  motionEasings,
  motionSprings,
  motionStagger,
} from '@/lib/motion/tokens'
import { useAppTheme } from '@/theme/theme-provider'

export interface QuickAction {
  key: 'expense' | 'fixed' | 'income' | 'no-spend'
  label: string
  icon: keyof typeof MaterialIcons.glyphMap
  onPress: () => void
}

interface AddQuickActionsOverlayProps {
  visible: boolean
  onDismiss: () => void
  actions: QuickAction[]
}

// ─── Fan layout ─────────────────────────────────────────────────
// 4 actions emerge from the FAB center as a 90° fan arc, anchored
// to the FAB so the menu reads as something unfurling FROM the
// button, not floating beside it.
//
// Angles measured from horizontal (counter-clockwise), 90° = up.
// Index 0 = leftmost, index 3 = rightmost. Order matches the
// `actions` prop, so the caller controls the L→R sequence.
//
// Radius bumped 120 → 130 when we went from 3 to 4 petals so the
// inner pair (105°/75°) has enough horizontal separation not to
// overlap visually.
const FAN_ANGLES_DEG = [135, 105, 75, 45]
const FAN_RADIUS = 130 // distance from FAB center to each mini-FAB center
const ACTION_SIZE = 56
const LABEL_WIDTH = 96 // wide enough for "Gasto fijo" on one line
// FAB center from screen bottom: tab bar bottom (14) + tab bar
// half height (44) + FAB lift (18) ≈ 76. Bumped a touch so the
// petals don't overlap the FAB face itself.
const ANCHOR_BOTTOM = 76

export function AddQuickActionsOverlay({
  visible,
  onDismiss,
  actions,
}: AddQuickActionsOverlayProps) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const progress = useSharedValue(0)
  // `mounted` decouples the Modal's lifecycle from the parent's
  // `visible` prop so the dismiss spring has something to animate
  // against. If we bound `<Modal visible={visible}>` directly, the
  // Modal would unmount the moment the parent flipped the prop —
  // before the spring had a chance to play — and the petals would
  // just vanish on scrim tap.
  const [mounted, setMounted] = useState(false)
  // Set by the petal's onSelect right before triggering the dismiss
  // so the next render's effect skips the spring and unmounts the
  // overlay on the same frame. Selecting a petal hands the user's
  // attention off to the new route's entrance animation; a slow
  // retraction here would just compete with it. Tap-on-scrim still
  // takes the spring path because there's no follow-up animation
  // to absorb the user's focus.
  const skipNextExitRef = useRef(false)

  useEffect(() => {
    if (reduced) {
      // Reduced-motion users skip the choreography in both directions.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional sync of mount state when visible toggles
      setMounted(visible)
      progress.value = visible ? 1 : 0
      return
    }
    if (visible) {
      setMounted(true)
      // `motionSprings.radialEnter` — soft enough that each petal
      // lands with a hint of bounce as it settles into the fan.
      progress.value = withSpring(1, motionSprings.radialEnter)
    } else if (skipNextExitRef.current) {
      // Petal selected — instant collapse so the next route's
      // entrance has the stage to itself.
      skipNextExitRef.current = false
      progress.value = 0
      setMounted(false)
    } else {
      // Timing-based exit, not a spring. Reasoning: a critically-
      // damped spring landing at 0 only fires its `finished` callback
      // once the value is within Reanimated's rest threshold (~5τ),
      // which for the radialExit spring family was ~280ms. While
      // that callback was pending, the native `<Modal>` remained
      // mounted and OS-level captured all touches — the FAB
      // underneath was un-tappable for the full window even though
      // the petals were visually gone after ~150ms. That broke
      // `interruptible` and `tap-feedback-speed` from the motion
      // checklist.
      //
      // Replace with a deterministic 140ms timing using the
      // `exitStandard` curve (ease-in cubic). The petals still
      // accelerate into the FAB origin — visually compatible with
      // the spring entrance — but the Modal unmounts in a known,
      // short window. The per-petal interpolation windows below
      // still run in reverse on the descending progress, just
      // compressed into the shorter total. Exit is now ~50% of the
      // spring entrance, satisfying `exit-faster-than-enter`.
      progress.value = withTiming(
        0,
        {
          duration: motionDurations.exitTab,
          easing: motionEasings.exitStandard,
        },
        (finished) => {
          if (finished) {
            runOnJS(setMounted)(false)
          }
        },
      )
    }
  }, [visible, progress, reduced])

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
  }))

  return (
    <Modal
      transparent
      visible={mounted}
      onRequestClose={onDismiss}
      statusBarTranslucent
      animationType="none"
    >
      {/* Blurred scrim — feels closer to iOS Control Center / a
          system sheet than a flat black overlay. Tap dismisses. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss}>
        <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
          <BlurView
            intensity={32}
            tint={theme.isDark ? 'dark' : 'systemChromeMaterialDark'}
            style={StyleSheet.absoluteFill}
          />
          {/* Extra dim layer so the petals stay legible even when
              the underlying screen is bright. */}
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: '#06120C', opacity: 0.42 },
            ]}
          />
        </Animated.View>
      </Pressable>

      {/* Anchor — single zero-size point at the FAB center. Each
          petal is `position: absolute` and translated outward from
          this origin, so the layout is genuinely radial. */}
      <View style={styles.anchorWrap} pointerEvents="box-none">
        <View style={styles.anchorPoint} pointerEvents="box-none">
          {actions.map((action, index) => (
            <ActionPetal
              key={action.key}
              action={action}
              index={index}
              progress={progress}
              reduced={reduced}
              onSelect={() => {
                void triggerHaptic('selection')
                // Flip the skip flag *before* onDismiss so the effect
                // triggered by the parent's setVisible(false) takes
                // the instant-collapse branch instead of the spring.
                skipNextExitRef.current = true
                onDismiss()
                // Push the route synchronously — the modal/sheet's
                // own entrance animation now owns the user's focus.
                action.onPress()
              }}
              theme={theme}
            />
          ))}
        </View>
      </View>
    </Modal>
  )
}

function ActionPetal({
  action,
  index,
  progress,
  reduced,
  onSelect,
  theme,
}: {
  action: QuickAction
  index: number
  progress: SharedValue<number>
  reduced: boolean
  onSelect: () => void
  theme: ReturnType<typeof useAppTheme>['theme']
}) {
  const angleRad = (FAN_ANGLES_DEG[index] * Math.PI) / 180
  const targetX = FAN_RADIUS * Math.cos(angleRad)
  // Screen-y grows downward, so "up" is negative.
  const targetY = -FAN_RADIUS * Math.sin(angleRad)

  // Stagger the unfurl so the petals read sequentially L→R rather
  // than all popping at once. The token is unitless (a fraction of
  // `progress`), so the petals' interpolation windows shift in lock-
  // step with the parent spring instead of using wall-clock delays.
  const start = index * motionStagger.fanProgress
  const end = Math.min(1, start + 0.7)

  const petalStyle = useAnimatedStyle(() => {
    const t = progress.value
    if (reduced) {
      return {
        opacity: t,
        transform: [
          { translateX: targetX * t },
          { translateY: targetY * t },
        ],
      }
    }
    const local = interpolate(t, [start, end], [0, 1], Extrapolation.CLAMP)
    const opacity = interpolate(
      local,
      [0, 0.4, 1],
      [0, 0.9, 1],
      Extrapolation.CLAMP,
    )
    // Slight overshoot at 0.7 → settles at 1. Reads as a tiny pop
    // when the petal arrives at its final position.
    const scale = interpolate(
      local,
      [0, 0.7, 1],
      [0.32, 1.06, 1],
      Extrapolation.CLAMP,
    )
    return {
      opacity,
      transform: [
        { translateX: targetX * local },
        { translateY: targetY * local },
        { scale },
      ],
    }
  })

  return (
    <Animated.View style={[styles.petal, petalStyle]} pointerEvents="box-none">
      <Pressable
        accessibilityLabel={action.label}
        accessibilityRole="button"
        onPress={onSelect}
        style={({ pressed }) => [
          styles.petalCircle,
          {
            backgroundColor: theme.colors.primary,
            opacity: pressed ? 0.92 : 1,
            shadowColor: theme.colors.primary,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: theme.isDark ? 0.42 : 0.34,
            shadowRadius: 14,
            elevation: 12,
          },
        ]}
        hitSlop={6}
      >
        <MaterialIcons
          name={action.icon}
          size={26}
          color={theme.isDark ? '#0E1B14' : '#FFFFFF'}
        />
      </Pressable>
      <Text
        style={styles.petalLabel}
        numberOfLines={1}
      >
        {action.label}
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  anchorWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  anchorPoint: {
    position: 'absolute',
    bottom: ANCHOR_BOTTOM,
    left: '50%',
    width: 0,
    height: 0,
  },
  petal: {
    position: 'absolute',
    alignItems: 'center',
    // Center the petal+label container on the anchor point.
    left: -LABEL_WIDTH / 2,
    top: -ACTION_SIZE / 2,
    width: LABEL_WIDTH,
  },
  petalCircle: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petalLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
})
