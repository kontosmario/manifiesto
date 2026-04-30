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

import { useCallback, useRef } from 'react'
import { useRouter } from 'expo-router'
import { Alert, Linking } from 'react-native'
import { triggerHaptic } from '@/lib/haptics'
import { useSendMemberWarning } from '@/features/insights/use-send-member-warning'
import { dismissCard } from '@/features/insights/control-dismiss-store'
import { useControlAnchors } from '@/features/insights/control-section-anchors'
import { useAddSavingsContribution } from '@/features/savings-goals/use-add-savings-contribution'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { formatMoney } from '@/utils/money'
import {
  logAdvisorInteraction,
  type AdvisorOutcome,
  type AdvisorSurface,
} from '@/features/insights/log-advisor-interaction'
import { logAdvisorValue } from '@/features/insights/log-advisor-value'
import type { ControlAction } from '@/features/insights/control-action'

interface DispatcherContext {
  familyId: string
  userId: string
  onOpenStreakSheet?: () => void
}

/** Optional metadata passed alongside an action so the dispatcher can
 *  log the interaction to the Memory Layer. Surfaces that don't supply
 *  it will dispatch normally — the log entry is just skipped. */
export interface DispatchMeta {
  taskId: string
  surface: AdvisorSurface
  /** Subset of the task's analytical context used by persona / causal
   *  engines later (urgency, confidence, impactRaw). */
  taskContext?: Record<string, unknown>
  /** ms between the task being shown and the action firing — surfaces
   *  that track this can pass it through. Optional. */
  timeToActionMs?: number
}

// ─── Circuit breaker ────────────────────────────────────────────────
//
// Prevent the same action from firing twice in quick succession — covers
// both accidental double-taps and React re-renders that re-mount a CTA.
// Idempotent kinds (navigate, scroll, dismiss) are exempt; mutations
// (savings contribution, member warning, external URL) and modals
// (open-coach, open-fixed-expense) are gated.
const CIRCUIT_BREAKER_WINDOW_MS = 1500

const CIRCUIT_BREAKER_KINDS = new Set<ControlAction['kind']>([
  'open-fixed-expense',
  'open-add-fixed-prefilled',
  'open-savings-goal',
  'open-streak-sheet',
  'send-member-warning',
  'quick-savings-contribution',
  'open-external-url',
  'open-coach-mode',
])

function actionKey(action: ControlAction): string {
  switch (action.kind) {
    case 'open-fixed-expense':
      return `${action.kind}:${action.fixedExpenseId}`
    case 'open-add-fixed-prefilled':
      return `${action.kind}:${action.amount ?? ''}:${action.description ?? ''}`
    case 'send-member-warning':
      return `${action.kind}:${action.targetUserId}`
    case 'quick-savings-contribution':
      return `${action.kind}:${action.dismissId}`
    case 'open-external-url':
      return `${action.kind}:${action.url}`
    case 'open-coach-mode':
      return `${action.kind}:${action.signalId}`
    default:
      return action.kind
  }
}

export function useControlActionDispatcher(ctx: DispatcherContext) {
  const router = useRouter()
  const warningMutation = useSendMemberWarning()
  const anchors = useControlAnchors()
  const savingsGoalQuery = useSavingsGoal(ctx.familyId)
  const addContributionMutation = useAddSavingsContribution(ctx.familyId)
  const lastFireRef = useRef<Map<string, number>>(new Map())

  return useCallback(
    (action: ControlAction, meta?: DispatchMeta) => {
      // Circuit breaker: drop the call when the same key fired inside
      // the cooldown window. Prevents accidental double-mutations and
      // duplicate modals during fast taps or re-renders.
      if (CIRCUIT_BREAKER_KINDS.has(action.kind)) {
        const key = actionKey(action)
        const now = Date.now()
        const last = lastFireRef.current.get(key) ?? 0
        if (now - last < CIRCUIT_BREAKER_WINDOW_MS) return
        lastFireRef.current.set(key, now)
      }
      // Memory layer auto-log. `dismiss` fires `dismissed`; everything
      // else is a positive `acted`. Confirmation-gated kinds (savings
      // contribution, member warning) log inside their success branch
      // so we never count a cancel as `acted`.
      if (meta) {
        const outcome: AdvisorOutcome | null =
          action.kind === 'dismiss'
            ? 'dismissed'
            : action.kind === 'send-member-warning' ||
              action.kind === 'quick-savings-contribution'
            ? null
            : 'acted'
        if (outcome) {
          void logAdvisorInteraction({
            familyId: ctx.familyId,
            signalId: meta.taskId,
            outcome,
            surface: meta.surface,
            context: meta.taskContext,
            timeToActionMs: meta.timeToActionMs,
          })
          // Counterfactual value capture only for events where the CTA
          // tap IS the realization moment. Tapping `open-fixed-expense`
          // on a zombie just navigates to the editor — the user might
          // not actually cancel — so we deliberately don't log
          // `cancelled_zombie` here. That value is logged downstream
          // when `delete-fixed-expense` succeeds (TODO: wire from the
          // fixed-expense mutation), keeping the Trust Receipt honest.
          // Same for hikes: the renegotiation is logged when the
          // amount actually drops, not on navigation.
          if (outcome === 'acted') {
            const ctxImpact = Number(
              (meta.taskContext as Record<string, unknown> | undefined)?.impactRaw ?? 0,
            )
            if (meta.taskId === 'savings-milestone' && ctxImpact > 0) {
              void logAdvisorValue({
                familyId: ctx.familyId,
                signalId: meta.taskId,
                actionTaken: 'completed_goal',
                valueSaved: ctxImpact,
                horizonMonths: 1,
                evidence: { goalAmount: ctxImpact },
                isEstimated: false,
              })
            }
          }
        }
      }
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
                        if (meta) {
                          void logAdvisorInteraction({
                            familyId: ctx.familyId,
                            signalId: meta.taskId,
                            outcome: 'acted',
                            surface: meta.surface,
                            context: meta.taskContext,
                            timeToActionMs: meta.timeToActionMs,
                          })
                        }
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
                        if (meta) {
                          void logAdvisorInteraction({
                            familyId: ctx.familyId,
                            signalId: meta.taskId,
                            outcome: 'acted',
                            surface: meta.surface,
                            context: { ...meta.taskContext, contributedAmount: amount },
                            timeToActionMs: meta.timeToActionMs,
                          })
                          // Counterfactual value: the contribution itself
                          // is the realized value. One-shot horizon — we
                          // don't claim the same dollars repeat monthly.
                          void logAdvisorValue({
                            familyId: ctx.familyId,
                            signalId: meta.taskId,
                            actionTaken: 'moved_to_savings',
                            valueSaved: amount,
                            horizonMonths: 1,
                            evidence: {
                              goalId: goal.id,
                              goalTitle: goal.title,
                              contributedAmount: amount,
                            },
                            isEstimated: false,
                          })
                        }
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
        case 'open-external-url': {
          // https-only — `Linking.openURL` will reject anything else.
          if (!/^https:\/\//i.test(action.url)) return
          void triggerHaptic('selection')
          if (action.dismissId) dismissCard(action.dismissId)
          void Linking.openURL(action.url).catch(() => {
            Alert.alert('No pudimos abrir el enlace', 'Probá de nuevo más tarde.')
          })
          return
        }
        case 'open-coach-mode': {
          void triggerHaptic('selection')
          const params: Record<string, string> = { signalId: action.signalId }
          if (action.topic) params.topic = action.topic
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- coach route is dynamic and not yet in expo-router's typed map
          router.push({ pathname: '/(app)/coach/[signalId]' as any, params })
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
