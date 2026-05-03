import { useCallback, useState } from 'react'
import {
  type PressableProps,
  type PressableStateCallbackType,
  Pressable,
  StyleSheet,
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { AddExpenseTabButtonFace } from '@/components/navigation/add-expense-tab-button-face'
import {
  AddQuickActionsOverlay,
  type QuickAction,
} from '@/components/navigation/add-quick-actions-overlay'
import { useAddExpenseButtonBurst } from '@/components/navigation/add-expense-tab-button.model'
import { usePressScale } from '@/hooks/use-press-scale'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { withAlpha } from '@/theme/color-utils'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET } from '@/theme/interaction'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Center-stage FAB for "Agregar gasto".
 *
 * Two interactions:
 *   · Tap (haptic light) → opens the add-expense form (most common
 *     action, kept frictionless)
 *   · Long-press (haptic medium) → opens a Speed Dial with 3 quick
 *     actions: Gasto / Fijo / Meta
 *
 * Motion:
 *   · scale 0.93 on press, immediate visual feedback
 *   · burst ring expands + fades on tap release (300ms ease-out)
 *   · no idle motion — the FAB stays calm; visual prominence comes
 *     from the elevated mint shadow + cutout border ring
 */
export function AddExpenseTabButton({
  accessibilityState,
  onPress: forwardedOnPress,
  onLongPress: forwardedOnLongPress,
  onPressIn,
  onPressOut,
  style,
  ...pressableProps
}: PressableProps & {
  accessibilityState?: { selected?: boolean }
}) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const isReducedMotionEnabled = useReducedMotion()
  const pressScale = usePressScale({ pressedScale: 0.93 })
  const { burstRingStyle, triggerBurst } = useAddExpenseButtonBurst(isReducedMotionEnabled)
  const [quickActionsVisible, setQuickActionsVisible] = useState(false)
  // expo-router passes its own onPress + onLongPress through tabBarButton
  // props. We discard them — our handlers below define the actual
  // behavior (tap → add-expense, long-press → speed dial). If we
  // didn't extract them, the trailing `{...pressableProps}` spread
  // would silently override our handlers, which is exactly what was
  // happening before this fix (long-press never triggered the menu).
  void forwardedOnPress
  void forwardedOnLongPress

  const resolveForwardedStyle = (state: PressableStateCallbackType) =>
    typeof style === 'function' ? style(state) : style

  const handlePress = useCallback(() => {
    void triggerHaptic('light')
    triggerBurst()
    router.push('/(app)/add-expense')
  }, [router, triggerBurst])

  const handleLongPress = useCallback(() => {
    void triggerHaptic('medium')
    setQuickActionsVisible(true)
  }, [])

  const quickActions: QuickAction[] = [
    {
      key: 'income',
      label: 'Ingreso',
      icon: 'trending-up',
      onPress: () => router.push('/(app)/add-income'),
    },
    {
      key: 'fixed',
      label: 'Gasto fijo',
      icon: 'event-repeat',
      onPress: () => router.push('/(app)/add-fixed-expense'),
    },
    {
      key: 'expense',
      label: 'Gasto',
      icon: 'add',
      onPress: () => router.push('/(app)/add-expense'),
    },
  ]

  return (
    <>
      <Pressable
        accessibilityLabel="Agregar gasto"
        accessibilityHint="Mantené presionado para más acciones"
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        android_ripple={{
          borderless: false,
          color: withAlpha('#FFFFFF', 0.2),
          radius: 40,
        }}
        delayLongPress={350}
        hitSlop={DEFAULT_HIT_SLOP}
        onPress={handlePress}
        onLongPress={handleLongPress}
        onPressIn={(event) => {
          pressScale.onPressIn()
          onPressIn?.(event)
        }}
        onPressOut={(event) => {
          pressScale.onPressOut()
          onPressOut?.(event)
        }}
        pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
        style={(state) => [
          resolveForwardedStyle(state),
          styles.addButtonWrap,
          {
            opacity: state.pressed ? 0.96 : 1,
          },
        ]}
        {...pressableProps}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.burstRing,
            { borderColor: withAlpha(theme.brand.bright, 0.9) },
            burstRingStyle,
          ]}
        />
        <Animated.View
          style={[
            pressScale.animatedStyle,
            {
              shadowColor: theme.isDark ? '#A6EF8F' : '#297811',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: theme.isDark ? 0.34 : 0.30,
              shadowRadius: 12,
              elevation: 12,
            },
          ]}
        >
          <AddExpenseTabButtonFace theme={theme} />
        </Animated.View>
      </Pressable>

      <AddQuickActionsOverlay
        visible={quickActionsVisible}
        onDismiss={() => setQuickActionsVisible(false)}
        actions={quickActions}
      />
    </>
  )
}

const styles = StyleSheet.create({
  addButtonWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    top: -18,
    position: 'relative',
  },
  burstRing: {
    position: 'absolute',
    alignSelf: 'center',
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 2,
  },
})
