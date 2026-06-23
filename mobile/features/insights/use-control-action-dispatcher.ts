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
import { dismissCard } from '@/features/insights/control-dismiss-store'
import { useControlAnchors } from '@/features/insights/control-section-anchors'
import { openSettingsModal } from '@/features/insights/settings-modal-coordinator'
import {
  requestFixedExpenseAdd,
  requestFixedExpenseEdit,
  requestMemberWarning,
  requestSavingsContribution,
  requestSavingsGoalEdit,
} from '@/features/insights/advisor-action-coordinator'
import {
  logAdvisorInteraction,
  type AdvisorOutcome,
  type AdvisorSurface,
} from '@/features/insights/log-advisor-interaction'
import { logAdvisorValue } from '@/features/insights/log-advisor-value'
import type { ControlAction } from '@/features/insights/control-action'
import { useQueryClient } from '@tanstack/react-query'
import { syncAllAfterMutation } from '@/lib/sync-after-mutation'
import {
  recordSubscriptionUsage,
  declareSubscriptionCancelIntent,
  todayCheckinPeriod,
} from '@/features/subscriptions-zombie/record-subscription-usage'

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
// Idempotent kinds (navigate, scroll, dismiss) are exempt; sheet
// hand-offs (savings contribution, member warning, savings-goal
// edit, fixed-expense edit/add, settings) are also exempt — see
// CIRCUIT_BREAKER_KINDS comment below for why. Only true side-
// effecting kinds (external URL, coach route, streak sheet) are
// gated.
const CIRCUIT_BREAKER_WINDOW_MS = 1500

const CIRCUIT_BREAKER_KINDS = new Set<ControlAction['kind']>([
  'open-streak-sheet',
  'open-external-url',
  'open-coach-mode',
  // Modal-open kinds (settings, member-warning, savings-contribution,
  // savings-goal-edit, fixed-expense-edit, fixed-expense-add) are
  // intentionally EXCLUDED. They don't run a mutation directly —
  // they hand off to the coordinator, which is idempotent (last
  // request wins), and the host's mutation has its own `isPending`
  // guard. Keeping them in the breaker meant that after the user
  // dismissed the sheet, the next tap was silently swallowed for up
  // to 1.5s because the breaker's last-fired timestamp was still in
  // cooldown.
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
    case 'open-settings-modal':
      return `${action.kind}:${action.modal}`
    default:
      return action.kind
  }
}

export function useControlActionDispatcher(ctx: DispatcherContext) {
  const router = useRouter()
  const anchors = useControlAnchors()
  const queryClient = useQueryClient()
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
        // Confirmation-gated kinds (anything that opens a sheet and
        // runs a mutation only on submit) log inside their host's
        // success branch — never count a cancel as `acted`.
        const isConfirmationGated =
          action.kind === 'send-member-warning' ||
          action.kind === 'quick-savings-contribution' ||
          action.kind === 'open-savings-goal' ||
          action.kind === 'open-fixed-expense' ||
          action.kind === 'open-add-fixed-prefilled'
        const outcome: AdvisorOutcome | null =
          action.kind === 'dismiss'
            ? 'dismissed'
            : isConfirmationGated
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
          // Dynamic dispatch: action.route comes from server-side
          // control signals (string). expo-router's `pathname` type is
          // a strict union of the static route map and parameterized
          // template strings; a server-provided arbitrary string can't
          // match it. We escape through `any` (documented) rather than
          // build a runtime guard against the typed route map.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          router.push({ pathname: action.route as any, params: action.params ?? {} })
          return
        }
        case 'open-fixed-expense': {
          if (!action.fixedExpenseId) return
          // Hand off to the global advisor-action host. The host
          // looks up the fixed expense in the cache and opens
          // `FixedExpenseQuickEditSheet` for fast name + amount
          // tweaks (price-hike CTA, zombie cancellation, etc).
          // Falls through to the full `/add-fixed-expense` editor
          // when the id isn't found in cache.
          void triggerHaptic('selection')
          requestFixedExpenseEdit(
            action.fixedExpenseId,
            meta
              ? {
                  taskId: meta.taskId,
                  surface: meta.surface,
                  context: meta.taskContext,
                  timeToActionMs: meta.timeToActionMs,
                }
              : null,
          )
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
          // Hand off to the global advisor-action host. The host
          // opens `AddFixedQuickSheet` pre-seeded with amount +
          // description and uses smart defaults (monthly recurring,
          // today's day-of-month) so the user can register the
          // detected recurring pattern in one tap.
          void triggerHaptic('selection')
          requestFixedExpenseAdd(
            action.amount ?? null,
            action.description ?? null,
            meta
              ? {
                  taskId: meta.taskId,
                  surface: meta.surface,
                  context: meta.taskContext,
                  timeToActionMs: meta.timeToActionMs,
                }
              : null,
          )
          return
        }
        case 'open-savings-goal': {
          // Hand off to the global advisor-action host. The host
          // opens `SavingsGoalQuickEditSheet` for fast goalAmount /
          // targetMonths tweaks. Falls through to /(app)/savings-goal
          // when no active goal exists yet (creation flow).
          void triggerHaptic('selection')
          requestSavingsGoalEdit(
            meta
              ? {
                  taskId: meta.taskId,
                  surface: meta.surface,
                  context: meta.taskContext,
                  timeToActionMs: meta.timeToActionMs,
                }
              : null,
          )
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
          // Hand off to the global advisor-action host (mounted in
          // AppStackShell) which renders the warning sheet, runs the
          // mutation on submit, and shows success/error feedback. The
          // host owns the mutation so the dispatcher stays slim.
          void triggerHaptic('selection')
          requestMemberWarning(
            action.targetUserId,
            action.message,
            meta
              ? {
                  taskId: meta.taskId,
                  surface: meta.surface,
                  context: meta.taskContext,
                  timeToActionMs: meta.timeToActionMs,
                }
              : null,
          )
          return
        }
        case 'quick-savings-contribution': {
          const amount = Math.max(0, Math.round(action.amount))
          if (amount <= 0) return
          // Hand off to the global advisor-action host. The host
          // checks whether an active savings goal exists, opens the
          // shared `QuickAddSavingsSheet` (slider + chips, same as
          // Home/Control alcancía) seeded at this amount, and runs
          // the contribution mutation on submit.
          void triggerHaptic('selection')
          requestSavingsContribution(
            amount,
            action.dismissId,
            meta
              ? {
                  taskId: meta.taskId,
                  surface: meta.surface,
                  context: meta.taskContext,
                  timeToActionMs: meta.timeToActionMs,
                }
              : null,
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
            Alert.alert('No pudimos abrir el enlace', 'Prueba de nuevo más tarde.')
          })
          return
        }
        case 'open-coach-mode': {
          void triggerHaptic('selection')
          const params: Record<string, string> = { signalId: action.signalId }
          if (action.topic) params.topic = action.topic
          // Coach route is parameterized but not yet in expo-router's
          // typed map. Same escape as the navigate case above.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          router.push({ pathname: '/(app)/coach/[signalId]' as any, params })
          return
        }
        case 'open-settings-modal': {
          // No router.push — the global host (mounted in
          // AppStackShell) subscribes to the coordinator and renders
          // the requested sheet on top of the current screen.
          void triggerHaptic('selection')
          openSettingsModal(action.modal)
          return
        }
        case 'sub-usage-answer': {
          // Optimista: descartar ya (supresión intra-sesión) + registrar la
          // respuesta en background. El gate del builder gobierna la cadencia
          // real (>= REASK_DAYS); el dismiss + TTL backstop evita reaparición.
          void triggerHaptic('success')
          dismissCard(action.dismissId)
          void recordSubscriptionUsage({
            fixedExpenseId: action.fixedExpenseId,
            level: action.level,
            period: todayCheckinPeriod(),
          })
            .then(() =>
              syncAllAfterMutation(queryClient, {
                familyId: ctx.familyId,
                userId: ctx.userId,
                scopes: ['fixed', 'fixedPayment'],
              }),
            )
            .catch(() => {
              Alert.alert(
                'No pudimos guardar tu respuesta',
                'Probá de nuevo en unos segundos.',
              )
            })
          return
        }
        case 'sub-usage-cancel': {
          void triggerHaptic('warning')
          dismissCard(action.dismissId)
          void declareSubscriptionCancelIntent(action.fixedExpenseId)
            .then(() =>
              syncAllAfterMutation(queryClient, {
                familyId: ctx.familyId,
                userId: ctx.userId,
                scopes: ['fixed', 'fixedPayment'],
              }),
            )
            .catch(() => {
              Alert.alert(
                'No pudimos registrar la cancelación',
                'Probá de nuevo en unos segundos.',
              )
            })
          return
        }
      }
    },
    [router, anchors, ctx, queryClient],
  )
}
