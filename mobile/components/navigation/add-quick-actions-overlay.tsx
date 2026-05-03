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
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
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

/**
 * Speed Dial overlay — opens above the FAB on long-press. 3 stacked
 * mini-actions slide up with a 60ms stagger so the eye reads top-to-
 * bottom. Tap on any: dismiss + run action. Tap on the scrim or on
 * the back button: dismiss with a short downward animation.
 *
 * Built as a `Modal` (not a Sheet) so the actions feel anchored to
 * the FAB, not pulled from the bottom of the screen — closer to the
 * Material 3 Speed Dial / Apple Reminders quick-add pattern.
 */
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
    progress.value = withTiming(visible ? 1 : 0, {
      duration: visible ? 220 : 160,
      easing: Easing.out(Easing.cubic),
    })
  }, [visible, progress, reduced])

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.5, // 50% scrim at peak — Material modal scrim guideline
  }))

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onDismiss}
      statusBarTranslucent
      animationType="none"
    >
      {/* Scrim — dismisses on tap */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: '#000' },
            scrimStyle,
          ]}
        />
      </Pressable>

      {/* Anchor — positioned just above the tab bar so the actions
          read as emerging from the FAB. Bottom inset accommodates
          the bar height (~88pt) + FAB lift (-18pt) + safe area. */}
      <View style={styles.anchor} pointerEvents="box-none">
        {actions.map((action, index) => (
          <ActionRow
            key={action.key}
            action={action}
            index={index}
            progress={progress}
            reduced={reduced}
            onSelect={() => {
              void triggerHaptic('selection')
              onDismiss()
              // Run the action after the dismiss starts so the user
              // sees the menu close before the next screen pushes.
              requestAnimationFrame(action.onPress)
            }}
            theme={theme}
          />
        ))}
      </View>
    </Modal>
  )
}

function ActionRow({
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
  // 60ms stagger top→bottom so the closest item to the FAB enters
  // last. Bottom row (index 2) appears first, top row (index 0) last.
  const reverseIndex = 2 - index
  const delay = reduced ? 0 : reverseIndex * 60

  // Each row owns its own animated value so the stagger works
  // correctly — `withDelay` on the shared `progress` would race
  // across siblings.
  const ownProgress = useSharedValue(0)
  useEffect(() => {
    if (reduced) {
      ownProgress.value = progress.value
      return
    }
    ownProgress.value = withDelay(
      delay,
      withTiming(progress.value, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      }),
    )
  }, [progress, ownProgress, delay, reduced])

  const staggeredStyle = useAnimatedStyle(() => ({
    opacity: ownProgress.value,
    transform: [{ translateY: interpolate(ownProgress.value, [0, 1], [16, 0]) }],
  }))

  return (
    <Animated.View style={[styles.row, staggeredStyle]}>
      <View style={[styles.label, { backgroundColor: theme.colors.creamCard }]}>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: 13,
            fontWeight: '700',
            letterSpacing: 0.2,
          }}
        >
          {action.label}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={action.label}
        accessibilityRole="button"
        onPress={onSelect}
        style={({ pressed }) => [
          styles.miniFab,
          {
            backgroundColor: theme.colors.primary,
            opacity: pressed ? 0.92 : 1,
            shadowColor: theme.colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: theme.isDark ? 0.30 : 0.26,
            shadowRadius: 8,
            elevation: 8,
          },
        ]}
        hitSlop={8}
      >
        <MaterialIcons
          name={action.icon}
          size={20}
          color={theme.isDark ? '#12211A' : '#FFFFFF'}
        />
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    right: 0,
    bottom: 110, // tab bar (~88) + FAB lift (-18) + breathing room
    paddingHorizontal: 20,
    gap: 14,
    alignItems: 'flex-end',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    // Subtle elevation — pairs with the mini-FAB but doesn't compete.
    shadowColor: '#12211A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 4,
  },
  miniFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
