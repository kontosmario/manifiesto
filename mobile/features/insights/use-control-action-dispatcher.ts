// Dispatcher: maps a declarative `ControlAction` into side-effects.
//
// This is the single place in the app that knows how to:
//  - navigate to routes with filter params
//  - open the savings-goal editor
//  - fire "mark as dismissed" for celebratory cards
//  - send a family-member warning notification
//  - trigger a smooth scroll + pulse on the Control screen itself
//
// Keeping the logic centralized means the 30 rules stay declarative
// (each one owns an `action` object) and the UI stays thin
// (`onPress={() => dispatch(action)}`).

import { useCallback } from 'react'
import { useRouter } from 'expo-router'
import { Alert } from 'react-native'
import { triggerHaptic } from '@/lib/haptics'
import { useSendMemberWarning } from '@/features/insights/use-send-member-warning'
import { dismissCard } from '@/features/insights/control-dismiss-store'
import { useControlAnchors } from '@/features/insights/control-section-anchors'
import { useAddSavingsContribution } from '@/features/savings-goals/use-add-savings-contribution'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { formatMoney } from '@/utils/money'
import type { ControlAction } from '@/features/insights/control-action'

interface DispatcherContext {
  familyId: string
  userId: string
  onOpenStreakSheet?: () => void
}

export function useControlActionDispatcher(ctx: DispatcherContext) {
  const router = useRouter()
  const warningMutation = useSendMemberWarning()
  const anchors = useControlAnchors()
  const savingsGoalQuery = useSavingsGoal(ctx.familyId)
  const addContributionMutation = useAddSavingsContribution(ctx.familyId)

  return useCallback(
    (action: ControlAction) => {
      switch (action.kind) {
        case 'navigate': {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- expo-router typed routes don't cover our dynamic dispatch
          router.push({ pathname: action.route as any, params: action.params ?? {} })
          return
        }
        case 'open-fixed-expense': {
          if (!action.fixedExpenseId) return
          router.push({
            pathname: '/(app)/add-fixed-expense',
            params: { id: action.fixedExpenseId },
          })
          return
        }
        case 'open-expenses-filtered': {
          const params: Record<string, string> = {}
          if (action.filter.categoryId) params.categoryId = action.filter.categoryId
          if (action.filter.priceMax != null)
            params.priceMax = String(action.filter.priceMax)
          if (action.filter.priceMin != null)
            params.priceMin = String(action.filter.priceMin)
          if (action.filter.dateRange) params.dateRange = action.filter.dateRange
          if (action.filter.focusExpenseId)
            params.focusExpenseId = action.filter.focusExpenseId
          router.push({
            pathname: '/(app)/(tabs)/expenses',
            params,
          })
          return
        }
        case 'open-add-fixed-prefilled': {
          const params: Record<string, string> = {}
          if (action.amount != null) params.amount = String(action.amount)
          if (action.description) params.description = action.description
          router.push({
            pathname: '/(app)/add-fixed-expense',
            params,
          })
          return
        }
        case 'open-savings-goal': {
          router.push('/(app)/savings-goal')
          return
        }
        case 'open-streak-sheet': {
          // The streak sheet lives on the Home screen. Without a
          // direct route, we navigate home and let the caller open
          // the sheet (via onOpenStreakSheet callback if provided).
          if (ctx.onOpenStreakSheet) {
            ctx.onOpenStreakSheet()
          } else {
            router.push('/(app)/(tabs)/home')
          }
          return
        }
        case 'scroll-to-section': {
          anchors.scrollToSection(action.section)
          return
        }
        case 'send-member-warning': {
          if (!action.targetUserId || action.targetUserId === ctx.userId) return
          Alert.alert(
            '¿Enviar aviso?',
            action.message,
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Enviar',
                style: 'default',
                onPress: () => {
                  void triggerHaptic('success')
                  warningMutation.mutate(
                    {
                      familyId: ctx.familyId,
                      targetUserId: action.targetUserId,
                      message: action.message,
                      createdBy: ctx.userId,
                    },
                    {
                      onSuccess: () => {
                        Alert.alert('Listo', 'Aviso enviado.')
                      },
                      onError: () => {
                        void triggerHaptic('error')
                        Alert.alert(
                          'No pudimos enviar',
                          'Reintentá en unos segundos.',
                        )
                      },
                    },
                  )
                },
              },
            ],
            { cancelable: true },
          )
          return
        }
        case 'quick-savings-contribution': {
          const goal = savingsGoalQuery.data
          if (!goal || !goal.isActive) {
            // No active goal — degrade to "open savings" so the user
            // can create one.
            router.push('/(app)/savings-goal')
            return
          }
          const amount = Math.max(0, Math.round(action.amount))
          if (amount <= 0) return
          Alert.alert(
            'Mover a la alcancía',
            `Vamos a mover ${formatMoney(amount)} a "${goal.title}". ¿Confirmás?`,
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Mover',
                style: 'default',
                onPress: () => {
                  void triggerHaptic('success')
                  addContributionMutation.mutate(
                    { goalId: goal.id, amount },
                    {
                      onSuccess: () => {
                        dismissCard(action.dismissId)
                        Alert.alert(
                          '¡Listo!',
                          `${formatMoney(amount)} sumados a tu alcancía.`,
                        )
                      },
                      onError: () => {
                        void triggerHaptic('error')
                        Alert.alert(
                          'No pudimos mover',
                          'Reintentá en unos segundos.',
                        )
                      },
                    },
                  )
                },
              },
            ],
            { cancelable: true },
          )
          return
        }
        case 'dismiss': {
          void triggerHaptic('success')
          dismissCard(action.dismissId)
          return
        }
      }
    },
    [
      router,
      warningMutation,
      anchors,
      ctx,
      savingsGoalQuery.data,
      addContributionMutation,
    ],
  )
}
