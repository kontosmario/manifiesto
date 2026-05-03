import { useEffect, useState } from 'react'
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
  type SharedValue,
} from 'react-native-reanimated'
import { BlurView } from 'expo-blur'
import { MaterialIcons } from '@expo/vector-icons'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'

export interface QuickAction {
  key: 'expense' | 'fixed' | 'income'
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
// 3 actions emerge from the FAB center as a 60° fan arc, anchored
// to the FAB so the menu reads as something unfurling FROM the
// button, not floating beside it.
//
// Angles measured from horizontal (counter-clockwise), 90° = up.
// Index 0 = leftmost, index 2 = rightmost. Order matches the
// `actions` prop, so the caller controls the L→R sequence.
const FAN_ANGLES_DEG = [135, 90, 45]
const FAN_RADIUS = 120 // distance from FAB center to each mini-FAB center
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

  useEffect(() => {
    if (reduced) {
      // Reduced-motion users skip the choreography in both directions.
      setMounted(visible)
      progress.value = visible ? 1 : 0
      return
    }
    if (visible) {
      setMounted(true)
      // Spring entrance — gives the fan an organic unfurl with a
      // touch of bounce as petals settle. Damping kept above 12 so
      // the bounce stays subtle (not toy-like).
      progress.value = withSpring(1, {
        damping: 14,
        stiffness: 160,
        mass: 0.9,
      })
    } else {
      // Spring dismiss — same family of motion as the entrance so
      // it feels like one continuous gesture. Critically damped
      // (damping = 2·√(stiffness·mass) = 24) so the petals retract
      // cleanly into the FAB without oscillating past zero, and a
      // slightly stiffer spring than the enter so the dismiss feels
      // purposeful instead of laggy. The per-petal interpolation
      // windows below run in reverse on the descending progress, so
      // the rightmost petal retracts first and the leftmost last —
      // mirroring the L→R unfurl on entry.
      //
      // The completion callback is what closes the loop with React:
      // we keep the Modal mounted until the spring lands at 0, then
      // hop back to JS to flip `mounted` and unmount. `finished` is
      // false when a new animation interrupts (e.g. user re-opens
      // mid-dismiss), so we only unmount on a clean landing.
      progress.value = withSpring(
        0,
        { damping: 24, stiffness: 180, mass: 0.8 },
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
                onDismiss()
                // Run the action after the dismiss starts so the user
                // sees the petals collapse before the next screen pushes.
                requestAnimationFrame(action.onPress)
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
  // than all popping at once. 80ms per step is enough to register
  // without slowing the open down.
  const stagger = 0.08
  const start = index * stagger
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
