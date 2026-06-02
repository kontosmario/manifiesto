import { useCallback, useMemo, useState } from 'react'
import { NoSpendConfirmSheet } from '@/components/gastos/no-spend-confirm-sheet'
import { useCategories, type Category } from '@/features/categories/use-categories'
import type { Expense } from '@/features/expenses/use-expenses'
import {
  type PressableProps,
  type PressableStateCallbackType,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { AddExpenseTabButtonFace } from '@/components/navigation/add-expense-tab-button-face'
import {
  AddQuickActionsOverlay,
  type QuickAction,
} from '@/components/navigation/add-quick-actions-overlay'
import { useAddExpenseButtonBurst } from '@/components/navigation/add-expense-tab-button.model'
// Pure decision function lives in a sibling `.ts` file so the unit
// test can import it under vitest's Node environment without
// pulling the component's transitive native deps (expo-router,
// expo-linear-gradient, @expo/vector-icons …).
import {
  decideNoSpendPetal,
  type NoSpendPetalDecision,
} from '@/components/navigation/add-expense-tab-button-no-spend-decision'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useExpenses } from '@/features/expenses/use-expenses'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
import {
  useMarkNoExpenseDay,
  useStreak,
  useUnmarkNoExpenseDay,
} from '@/features/streaks/use-streak'
import {
  HOME_TOUR,
  HOME_TOUR_STEPS,
  useTourTargetRef,
} from '@/features/tours'
import { usePressScale } from '@/hooks/use-press-scale'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { confetti } from '@/lib/confetti-bus'
import { triggerHaptic } from '@/lib/haptics'
import { toast } from '@/lib/toast-bus'
import { withAlpha } from '@/theme/color-utils'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET } from '@/theme/interaction'
import { useAppTheme } from '@/theme/theme-provider'

export { decideNoSpendPetal, type NoSpendPetalDecision }

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

  const session = useAuthSession()
  const userId = session.data?.user.id
  const homeSnapshot = useHomeSnapshot(userId)
  const familyId = homeSnapshot.data?.family?.familyId ?? undefined

  const streakResult = useStreak(familyId, userId)
  const expensesQuery = useExpenses(familyId)

  const markNoExpenseMutation = useMarkNoExpenseDay(familyId, userId)
  const unmarkNoExpenseMutation = useUnmarkNoExpenseDay(familyId, userId)

  const hasMarkedToday = streakResult.data?.hasMarkedNoExpenseToday ?? false

  // Today's own expenses + the list itself. Computed once: the
  // boolean drives the petal state machine, the array feeds the
  // confirm sheet so the user can verify what they registered.
  const expensesTodayOwn = useMemo((): Expense[] => {
    if (!userId) return []
    const expenses = expensesQuery.data ?? []
    const todayKey = new Date().toLocaleDateString('en-CA')
    const mine: Expense[] = []
    for (const e of expenses) {
      if (e.created_by !== userId) continue
      const created = new Date(e.created_at)
      if (created.toLocaleDateString('en-CA') === todayKey) mine.push(e)
    }
    return mine
  }, [userId, expensesQuery.data])
  const hasExpensesTodayOwn = expensesTodayOwn.length > 0

  // Sheet visibility for the "today has expenses, confirm anyway?"
  // flow. Replaces the previous Alert.alert with a ModalCard that
  // also lists the expenses so the user can verify.
  const [confirmSheetVisible, setConfirmSheetVisible] = useState(false)

  // Category lookup for the confirm sheet rows. useCategories is
  // already seeded by home_snapshot — cheap to call again.
  const categoriesQuery = useCategories(familyId)
  const categoryById = useMemo(() => {
    const map = new Map<string, Category>()
    for (const c of categoriesQuery.data ?? []) map.set(c.id, c)
    return map
  }, [categoriesQuery.data])

  // doMark accepts a `force` flag so the confirm-sheet path can
  // bypass the server-side EXPENSES_EXIST_ON_DATE guard (the user
  // already saw the expenses and consented). Without force, the
  // RPC rejects today-with-expenses inserts.
  const doMark = useCallback(
    (options?: { force?: boolean }) => {
      markNoExpenseMutation.mutate(
        options?.force ? { force: true } : undefined,
        {
          onSuccess: () => {
            void triggerHaptic('success')
            confetti.celebrate({ durationMs: 2000, origin: 'top' })
            toast.success('Día sin gastos registrado')
            setConfirmSheetVisible(false)
          },
          onError: (error: unknown) => {
            void triggerHaptic('error')
            toast.error(
              error instanceof Error
                ? error.message
                : 'No se pudo marcar. Reintentá en un momento.',
            )
          },
        },
      )
    },
    [markNoExpenseMutation],
  )

  const { theme } = useAppTheme()
  const isReducedMotionEnabled = useReducedMotion()
  const pressScale = usePressScale({ pressedScale: 0.93 })
  const { burstRingStyle, triggerBurst } = useAddExpenseButtonBurst(isReducedMotionEnabled)
  const [quickActionsVisible, setQuickActionsVisible] = useState(false)
  // Register the FAB as the closing step of the Home guided tour.
  // The button lives in the tab bar (shared chrome) but it's only
  // taught from Home — when the Gastos / Fijos / Control tours run,
  // this step doesn't participate (different tour key). The ref is
  // attached to a 66×66 inner wrapper (not the outer Pressable,
  // which is `flex: 1` and fills the whole tab cell — that's why
  // the cutout previously rendered as a wide oval instead of
  // matching the round face). Border radius is set generously: the
  // SVG cutout path clamps `r` to `min(r, w/2, h/2) = 33`, which
  // produces a perfect circle.
  const fabTourRef = useTourTargetRef(HOME_TOUR, HOME_TOUR_STEPS.fab.order, {
    text: HOME_TOUR_STEPS.fab.text,
    highlight: {
      borderRadius: 40,
      padding: 4,
      pulse: true,
      pulseColor: theme.brand.bright,
    },
  })
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

  // Semantic accent tints per action role. Each ring telegraphs the
  // action's category at-a-glance (positive cashflow vs scheduled
  // commitment vs celebration). The primary action (Gasto) omits the
  // ring on purpose so it stays the most chromatically minimal — that
  // visual quiet reads as "default" and keeps the brand green as the
  // strongest call-to-action.
  const ACCENT_NO_SPEND = '#7DD18D' // verde celebración (más claro que brand)
  const ACCENT_INCOME = '#5B9DF9'   // azul info (dinero que entra)
  const ACCENT_FIXED = '#A0A4A8'    // gris neutral (compromiso programado)

  const quickActions: QuickAction[] = [
    {
      key: 'no-spend',
      label: hasMarkedToday ? 'Marcado ✓' : 'Día sin gasto',
      icon: 'eco',
      visualState: hasMarkedToday ? 'marked' : 'default',
      accentColor: ACCENT_NO_SPEND,
      onPress: () => {
        const decision = decideNoSpendPetal({
          isMutationPending:
            markNoExpenseMutation.isPending || unmarkNoExpenseMutation.isPending,
          familyId,
          hasMarkedToday,
          hasExpensesTodayOwn,
        })

        switch (decision.kind) {
          case 'noop':
            if (decision.reason === 'no-family') {
              toast.info('Estamos preparando tu cuenta, intenta de nuevo en un instante.')
            }
            return

          case 'unmark':
            unmarkNoExpenseMutation.mutate(undefined, {
              onSuccess: () => {
                void triggerHaptic('selection')
                toast.info('Marca de día sin gastos removida.')
              },
              onError: (error: unknown) => {
                void triggerHaptic('error')
                toast.error(
                  error instanceof Error
                    ? error.message
                    : 'No se pudo revertir. Reintentá en un momento.',
                )
              },
            })
            return

          case 'mark-confirm':
            // Open the project-style ModalCard sheet (instead of the
            // generic Alert.alert) so the user can verify the list of
            // expenses they registered today before confirming.
            setConfirmSheetVisible(true)
            return

          case 'mark-direct':
            doMark()
            return
        }
      },
    },
    {
      key: 'income',
      label: 'Ingreso',
      icon: 'trending-up',
      accentColor: ACCENT_INCOME,
      onPress: () => router.push('/(app)/add-income'),
    },
    {
      key: 'fixed',
      label: 'Gasto fijo',
      icon: 'event-repeat',
      accentColor: ACCENT_FIXED,
      onPress: () => router.push('/(app)/add-fixed-expense'),
    },
    {
      key: 'expense',
      label: 'Gasto',
      icon: 'add',
      // No accentColor on purpose — the primary action stays the
      // chromatically dominant petal (brand green, no ring).
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
        {/* Tour ref host. Sized to the face exactly so the guided
            tour's cutout measures 66×66 (matches the visible disc)
            instead of the parent Pressable's full-cell box. */}
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

      <AddQuickActionsOverlay
        visible={quickActionsVisible}
        onDismiss={() => setQuickActionsVisible(false)}
        actions={quickActions}
      />

      <NoSpendConfirmSheet
        visible={confirmSheetVisible}
        expensesToday={expensesTodayOwn}
        categoryById={categoryById}
        isSubmitting={markNoExpenseMutation.isPending}
        onCancel={() => setConfirmSheetVisible(false)}
        onConfirm={() => doMark({ force: true })}
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
  tourTargetHost: {
    width: 66,
    height: 66,
  },
})
