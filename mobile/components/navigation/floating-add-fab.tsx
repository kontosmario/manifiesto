import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AddExpenseTabButtonFace } from '@/components/navigation/add-expense-tab-button-face'
import {
  AddQuickActionsOverlay,
  type QuickAction,
} from '@/components/navigation/add-quick-actions-overlay'
import { useAddExpenseButtonBurst } from '@/components/navigation/add-expense-tab-button.model'
import {
  HOME_TOUR,
  HOME_TOUR_STEPS,
  useTourTargetRef,
} from '@/features/tours'
import { usePressScale } from '@/hooks/use-press-scale'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { withAlpha } from '@/theme/color-utils'
import { DEFAULT_HIT_SLOP } from '@/theme/interaction'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Standalone floating FAB para "Agregar gasto". Vive FUERA de la tab
 * bar porque `NativeTabs` (UITabBarController nativo iOS 26) no permite
 * cells custom de tamaño diferente · Apple HIG dicta tabs uniformes.
 *
 * Posicionado absoluto centrado encima del tab bar nativa. Reusa todo
 * el visual + UX del `AddExpenseTabButton` original (face mint, burst
 * ring on tap, long-press speed dial). La única diferencia es la
 * posición (absolute en vez de tab-cell flex) y que no recibe
 * BottomTabBarButtonProps porque ya no es un tab button.
 */
export function FloatingAddFab() {
  const router = useRouter()
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const isReducedMotionEnabled = useReducedMotion()
  const pressScale = usePressScale({ pressedScale: 0.93 })
  const { burstRingStyle, triggerBurst } = useAddExpenseButtonBurst(isReducedMotionEnabled)
  const [quickActionsVisible, setQuickActionsVisible] = useState(false)

  // Tour ref se preserva igual que en el AddExpenseTabButton original ·
  // mide la position absoluta del face para el cutout del tour.
  const fabTourRef = useTourTargetRef(HOME_TOUR, HOME_TOUR_STEPS.fab.order, {
    text: HOME_TOUR_STEPS.fab.text,
    highlight: {
      borderRadius: 40,
      padding: 4,
      pulse: true,
      pulseColor: theme.brand.bright,
    },
  })

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

  // Position: bottom center · offset = safe area + native tab bar
  // height (~49pt en iOS, ~56dp en Android) + breathing room para que
  // el burst ring no se clipee contra el borde del tab bar.
  const TAB_BAR_HEIGHT = 49
  const BREATHING = 12
  const bottomOffset = insets.bottom + TAB_BAR_HEIGHT + BREATHING

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[styles.wrap, { bottom: bottomOffset }]}
      >
        <Pressable
          accessibilityLabel="Agregar gasto"
          accessibilityHint="Mantené presionado para más acciones"
          accessibilityRole="button"
          android_ripple={{
            borderless: false,
            color: withAlpha('#FFFFFF', 0.2),
            radius: 40,
          }}
          delayLongPress={350}
          hitSlop={DEFAULT_HIT_SLOP}
          onPress={handlePress}
          onLongPress={handleLongPress}
          onPressIn={pressScale.onPressIn}
          onPressOut={pressScale.onPressOut}
          style={styles.pressable}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.burstRing,
              { borderColor: withAlpha(theme.brand.bright, 0.9) },
              burstRingStyle,
            ]}
          />
          <View ref={fabTourRef} collapsable={false} style={styles.tourTargetHost}>
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
          </View>
        </Pressable>
      </View>

      <AddQuickActionsOverlay
        visible={quickActionsVisible}
        onDismiss={() => setQuickActionsVisible(false)}
        actions={quickActions}
      />
    </>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    // zIndex alto para que esté por encima del tab bar nativo · el
    // burst ring se extiende fuera del face y se vería clipeado si
    // el wrap quedara debajo.
    zIndex: 50,
  },
  pressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  burstRing: {
    position: 'absolute',
    alignSelf: 'center',
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 2,
  },
  tourTargetHost: {
    width: 66,
    height: 66,
  },
})
