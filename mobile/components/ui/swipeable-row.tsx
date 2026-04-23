import { useCallback, useRef, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { RectButton } from 'react-native-gesture-handler'
import Swipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable'
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated'
import { useAppTheme } from '@/theme/theme-provider'
import { typography } from '@/theme/typography'
import { triggerHaptic, type AppHapticTone } from '@/lib/haptics'

export interface SwipeAction {
  label: string
  tone?: 'neutral' | 'danger'
  onPress: () => void
  iconName?: string
}

interface SwipeableRowProps {
  children: ReactNode
  rightActions?: SwipeAction[]
  leftActions?: SwipeAction[]
  accessibilityHint: string  // required — CODE_RULES §11.4
  onSwipeOpenHaptic?: AppHapticTone
  /**
   * Outer border radius — both the row content and the swipe-action
   * reveal are clipped to this radius so the action button visually
   * fuses with the card instead of poking out as a square panel.
   */
  borderRadius?: number
}

export function SwipeableRow({
  children,
  rightActions = [],
  leftActions = [],
  accessibilityHint,
  onSwipeOpenHaptic = 'selection',
  borderRadius = 16,
}: SwipeableRowProps) {
  const swipeRef = useRef<SwipeableMethods>(null)

  const handleSwipeOpen = useCallback(() => {
    void triggerHaptic(onSwipeOpenHaptic)
  }, [onSwipeOpenHaptic])

  const renderActions = useCallback(
    (actions: SwipeAction[], side: 'left' | 'right') =>
      (progress: SharedValue<number>) => (
        <SwipeActionsRow
          actions={actions}
          side={side}
          progress={progress}
          onActionPress={(action) => {
            swipeRef.current?.close()
            action.onPress()
          }}
        />
      ),
    [],
  )

  return (
    <View
      accessible
      accessibilityHint={accessibilityHint}
      style={{ borderRadius, overflow: 'hidden' }}
    >
      <Swipeable
        ref={swipeRef}
        friction={1.8}
        overshootLeft={false}
        overshootRight={false}
        onSwipeableOpen={handleSwipeOpen}
        renderRightActions={rightActions.length ? renderActions(rightActions, 'right') : undefined}
        renderLeftActions={leftActions.length ? renderActions(leftActions, 'left') : undefined}
      >
        {children}
      </Swipeable>
    </View>
  )
}

interface SwipeActionsRowProps {
  actions: SwipeAction[]
  side: 'left' | 'right'
  progress: SharedValue<number>
  onActionPress: (action: SwipeAction) => void
}

function SwipeActionsRow({ actions, side, progress, onActionPress }: SwipeActionsRowProps) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0.6, 1]),
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [side === 'right' ? 40 : -40, 0]) },
    ],
  }))

  return (
    <Animated.View
      style={[
        styles.actionsRow,
        side === 'right' ? styles.actionsRight : styles.actionsLeft,
        style,
      ]}
    >
      {actions.map((action, index) => (
        <SwipeActionButton key={`${action.label}-${index}`} action={action} onPress={onActionPress} />
      ))}
    </Animated.View>
  )
}

function SwipeActionButton({ action, onPress }: { action: SwipeAction; onPress: (action: SwipeAction) => void }) {
  const { theme } = useAppTheme()
  const isDanger = action.tone === 'danger'
  const background = isDanger ? theme.colors.danger : theme.colors.primary
  const foreground = isDanger ? '#FFFFFF' : theme.isDark ? theme.brand.deep : '#FFFFFF'

  return (
    <RectButton
      onPress={() => {
        void triggerHaptic(isDanger ? 'warning' : 'selection')
        onPress(action)
      }}
      style={[styles.actionButton, { backgroundColor: background }]}
    >
      <Text style={[typography.buttonCompact, styles.actionLabel, { color: foreground }]}>
        {action.label}
      </Text>
    </RectButton>
  )
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  actionsRight: { justifyContent: 'flex-end' },
  actionsLeft:  { justifyContent: 'flex-start' },
  actionButton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    minWidth: 84,
  },
  actionLabel: { textAlign: 'center' },
})
