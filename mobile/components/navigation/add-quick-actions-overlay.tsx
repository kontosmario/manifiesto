import { useEffect } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
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

  useEffect(() => {
    if (reduced) {
      progress.value = visible ? 1 : 0
      return
    }
    if (visible) {
      // Spring entrance — gives the fan an organic unfurl with a
      // touch of bounce as petals settle. Damping kept above 12 so
      // the bounce stays subtle (not toy-like).
      progress.value = withSpring(1, {
        damping: 14,
        stiffness: 160,
        mass: 0.9,
      })
    } else {
      // Cubic ease-in collapse — petals accelerate as they're sucked
      // back into the FAB. Shorter than the entrance (~75%) so the
      // dismiss feels responsive, not laggy.
      progress.value = withTiming(0, {
        duration: 180,
        easing: Easing.in(Easing.cubic),
      })
    }
  }, [visible, progress, reduced])

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
  }))

  return (
    <Modal
      transparent
      visible={visible}
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
