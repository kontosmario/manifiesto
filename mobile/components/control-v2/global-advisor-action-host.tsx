import { Alert } from 'react-native'
import { useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'expo-router'
import { QuickAddSavingsSheet } from '@/components/home/quick-add-savings-sheet'
import { MemberWarningSheet } from '@/components/control-v2/member-warning-sheet'
import { SavingsGoalQuickEditSheet } from '@/components/control-v2/savings-goal-quick-edit-sheet'
import { FixedExpenseQuickEditSheet } from '@/components/control-v2/fixed-expense-quick-edit-sheet'
import { AddFixedQuickSheet } from '@/components/control-v2/add-fixed-quick-sheet'
import {
  claimNestedAdvisorHost,
  clearPendingAdvisorAction,
  useHasNestedAdvisorHost,
  usePendingAdvisorAction,
} from '@/features/insights/advisor-action-coordinator'
import { dismissCard } from '@/features/insights/control-dismiss-store'
import { useFamilyMembersDetail } from '@/features/family/use-family-members-detail'
import { useAddSavingsContribution } from '@/features/savings-goals/use-add-savings-contribution'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { useUpsertSavingsGoal } from '@/features/savings-goals/use-upsert-savings-goal'
import { useSendMemberWarning } from '@/features/insights/use-send-member-warning'
import {
  useFixedExpenses,
  useCreateFixedExpense,
  useUpdateFixedExpense,
} from '@/features/fixed-expenses/use-fixed-expenses'
import { useFixedExpenseCategories } from '@/features/categories/use-categories'
import { logAdvisorInteraction } from '@/features/insights/log-advisor-interaction'
import { logAdvisorValue } from '@/features/insights/log-advisor-value'
import { triggerHaptic } from '@/lib/haptics'
import { formatMoney } from '@/utils/money'

interface Props {
  familyId: string
  userId: string
  /**
   * `false` (default) → top-level host mounted in AppStackShell.
   * Steps aside while a nested host is active so iOS doesn't try to
   * stack an RN `<Modal>` over an already-presented stack-modal
   * (the Asistente screen, which would silently suppress the sheet).
   *
   * `true` → host mounted inside a route-modal screen (Asistente).
   * Claims the nested-host slot on mount so the top-level host
   * skips rendering, and renders the sheets within the asistente's
   * own view hierarchy where iOS will actually display them.
   */
  isNested?: boolean
}

/**
 * Global host for advisor CTAs that need a confirmation sheet.
 *
 * Flows:
 *   · `savings-contribution` → `QuickAddSavingsSheet` pre-seeded with
 *     the suggested amount.
 *   · `member-warning` → `MemberWarningSheet` with target preview +
 *     editable message body.
 *   · `savings-goal-edit` → `SavingsGoalQuickEditSheet` to tweak
 *     `goalAmount` / `targetMonths` on the existing goal. If no goal
 *     exists, falls through to `/savings-goal` so the user can create
 *     one (same auto-route gate the contribution flow uses).
 *   · `fixed-expense-edit` → `FixedExpenseQuickEditSheet` for fast
 *     name / amount tweaks on an existing fixed expense (price-hike
 *     CTA, zombie cancellation, etc). All other fields preserved.
 *   · `fixed-expense-add` → `AddFixedQuickSheet` to register a
 *     detected recurring expense as a fixed with smart defaults
 *     (monthly, recurring, today's day-of-month).
 *
 * All sheets share the dispatcher → coordinator → host architecture
 * so the dispatcher stays slim, and use the `inline` rendering path
 * when mounted inside the Asistente stack-modal so iOS doesn't try
 * to stack two presented UIVCs.
 */
export function GlobalAdvisorActionHost({
  familyId,
  userId,
  isNested = false,
}: Props) {
  const router = useRouter()
  const pending = usePendingAdvisorAction()
  const hasNested = useHasNestedAdvisorHost()

  // Nested hosts claim the slot for as long as they're mounted. The
  // top-level host steps aside while the claim is active so we don't
  // double-render or fight iOS's modal stacking.
  useEffect(() => {
    if (!isNested) return
    return claimNestedAdvisorHost()
  }, [isNested])

  const isActiveHost = isNested || !hasNested

  // ─── Data hooks (always mounted) ──────────────────────────────
  //
  // Both top-level and nested hosts mount the data hooks so the
  // React Query cache stays hot regardless of which one renders
  // sheets. Only the ACTIVE host runs side-effect useEffects (route
  // fall-throughs) — letting both fire those creates router races.

  const savingsGoalQuery = useSavingsGoal(familyId)
  const goal = savingsGoalQuery.data ?? null

  const fixedExpensesQuery = useFixedExpenses(familyId)
  const fixedExpensesData = fixedExpensesQuery.data

  const categoriesQuery = useFixedExpenseCategories(familyId)
  const categories = categoriesQuery.data ?? []

  // ─── Auto-route fall-throughs ─────────────────────────────────
  //
  // Several requests should NOT show a sheet when their target data
  // doesn't exist yet — they should redirect to the full editor so
  // the user can create the missing prerequisite. Gates here, all
  // critical:
  //
  //   1. Guard on `data === null`, NOT `goal == null`. React Query's
  //      `data` is `undefined` while loading or refetching and `null`
  //      only after a resolved-empty fetch.
  //   2. Guard on `!isFetching` as well — `isLoading` is only true
  //      on the first fetch; subsequent refetches use `isFetching`.
  //   3. Only the ACTIVE host fires the route, so we don't race two
  //      `router.push` calls.

  // savings-contribution → /(app)/savings-goal when no goal yet.
  useEffect(() => {
    if (!isActiveHost) return
    if (pending?.type !== 'savings-contribution') return
    if (savingsGoalQuery.isLoading || savingsGoalQuery.isFetching) return
    if (savingsGoalQuery.data === undefined) return
    if (savingsGoalQuery.data && savingsGoalQuery.data.isActive) return
    clearPendingAdvisorAction()
    router.push('/(app)/savings-goal')
  }, [
    isActiveHost,
    pending,
    savingsGoalQuery.data,
    savingsGoalQuery.isLoading,
    savingsGoalQuery.isFetching,
    router,
  ])

  // savings-goal-edit → /(app)/savings-goal when no goal yet (so the
  // user gets the full creation flow, not an empty edit sheet).
  useEffect(() => {
    if (!isActiveHost) return
    if (pending?.type !== 'savings-goal-edit') return
    if (savingsGoalQuery.isLoading || savingsGoalQuery.isFetching) return
    if (savingsGoalQuery.data === undefined) return
    if (savingsGoalQuery.data && savingsGoalQuery.data.isActive) return
    clearPendingAdvisorAction()
    router.push('/(app)/savings-goal')
  }, [
    isActiveHost,
    pending,
    savingsGoalQuery.data,
    savingsGoalQuery.isLoading,
    savingsGoalQuery.isFetching,
    router,
  ])

  // fixed-expense-edit → /(app)/add-fixed-expense?id=… when the id
  // isn't found in the cache (deleted, stale signal, etc).
  const targetFixedExpense = useMemo(() => {
    if (pending?.type !== 'fixed-expense-edit') return null
    if (!fixedExpensesData) return null
    return fixedExpensesData.find((e) => e.id === pending.fixedExpenseId) ?? null
  }, [pending, fixedExpensesData])
  useEffect(() => {
    if (!isActiveHost) return
    if (pending?.type !== 'fixed-expense-edit') return
    if (fixedExpensesQuery.isLoading || fixedExpensesQuery.isFetching) return
    if (fixedExpensesQuery.data === undefined) return
    if (targetFixedExpense) return
    // Fixed expense not in the cache after a settled fetch — the
    // record is gone. Drop the pending action and route to the full
    // editor (which will show its own "not found" handling).
    clearPendingAdvisorAction()
    router.push({
      pathname: '/(app)/add-fixed-expense',
      params: { id: pending.fixedExpenseId },
    })
  }, [
    isActiveHost,
    pending,
    targetFixedExpense,
    fixedExpensesQuery.data,
    fixedExpensesQuery.isLoading,
    fixedExpensesQuery.isFetching,
    router,
  ])

  // ─── Savings contribution ─────────────────────────────────────
  const addContributionMutation = useAddSavingsContribution(familyId)

  const savingsRequest =
    pending?.type === 'savings-contribution' ? pending : null
  const savingsRemaining = useMemo(() => {
    if (!goal) return 0
    return Math.max(0, goal.goalAmount - goal.currentAmount)
  }, [goal])

  const handleSubmitSavings = useCallback(
    (amount: number) => {
      if (!savingsRequest) return
      if (!goal || !goal.isActive) {
        clearPendingAdvisorAction()
        router.push('/(app)/savings-goal')
        return
      }
      const safeAmount = Math.max(0, Math.round(amount))
      if (safeAmount <= 0) return
      void triggerHaptic('success')
      addContributionMutation.mutate(
        { goalId: goal.id, amount: safeAmount },
        {
          onSuccess: () => {
            dismissCard(savingsRequest.dismissId)
            const meta = savingsRequest.meta
            if (meta) {
              void logAdvisorInteraction({
                familyId,
                signalId: meta.taskId,
                outcome: 'acted',
                surface: meta.surface,
                context: { ...meta.context, contributedAmount: safeAmount },
                timeToActionMs: meta.timeToActionMs,
              })
              // Counterfactual value capture: the contribution itself
              // is the realized impact. One-shot horizon — same
              // dollars don't repeat monthly.
              void logAdvisorValue({
                familyId,
                signalId: meta.taskId,
                actionTaken: 'moved_to_savings',
                valueSaved: safeAmount,
                horizonMonths: 1,
                evidence: {
                  goalId: goal.id,
                  goalTitle: goal.title,
                  contributedAmount: safeAmount,
                },
                isEstimated: false,
              })
            }
            clearPendingAdvisorAction()
            Alert.alert(
              '¡Listo!',
              `${formatMoney(safeAmount)} sumados a tu alcancía.`,
            )
          },
          onError: () => {
            void triggerHaptic('error')
            Alert.alert('No pudimos mover', 'Reintenta en unos segundos.')
          },
        },
      )
    },
    [savingsRequest, goal, addContributionMutation, router, familyId],
  )

  // ─── Member warning ───────────────────────────────────────────
  const warningRequest =
    pending?.type === 'member-warning' ? pending : null
  const membersQuery = useFamilyMembersDetail(familyId)
  const targetMember = useMemo(() => {
    if (!warningRequest) return null
    return (
      (membersQuery.data ?? []).find(
        (m) => m.userId === warningRequest.targetUserId,
      ) ?? null
    )
  }, [membersQuery.data, warningRequest])
  const warningMutation = useSendMemberWarning()

  const handleSubmitWarning = useCallback(
    (message: string) => {
      if (!warningRequest) return
      if (warningRequest.targetUserId === userId) {
        clearPendingAdvisorAction()
        return
      }
      void triggerHaptic('success')
      warningMutation.mutate(
        {
          familyId,
          targetUserId: warningRequest.targetUserId,
          message,
          createdBy: userId,
        },
        {
          onSuccess: () => {
            const meta = warningRequest.meta
            if (meta) {
              void logAdvisorInteraction({
                familyId,
                signalId: meta.taskId,
                outcome: 'acted',
                surface: meta.surface,
                context: meta.context,
                timeToActionMs: meta.timeToActionMs,
              })
            }
            clearPendingAdvisorAction()
            Alert.alert('Listo', 'Aviso enviado.')
          },
          onError: () => {
            void triggerHaptic('error')
            Alert.alert(
              'No pudimos enviar',
              'Reintenta en unos segundos.',
            )
          },
        },
      )
    },
    [warningRequest, warningMutation, familyId, userId],
  )

  // ─── Savings goal edit ─────────────────────────────────────────
  const upsertGoalMutation = useUpsertSavingsGoal(familyId)
  const goalEditRequest =
    pending?.type === 'savings-goal-edit' ? pending : null
  const handleSubmitGoalEdit = useCallback(
    (input: { goalAmount: number; targetMonths: number | null }) => {
      if (!goalEditRequest) return
      if (!goal || !goal.isActive) {
        clearPendingAdvisorAction()
        router.push('/(app)/savings-goal')
        return
      }
      const safeGoalAmount = Math.max(0, Math.round(input.goalAmount))
      if (safeGoalAmount <= 0) return
      void triggerHaptic('selection')
      upsertGoalMutation.mutate(
        {
          existingId: goal.id,
          input: {
            title: goal.title,
            emoji: goal.emoji,
            goalAmount: safeGoalAmount,
            currentAmount: goal.currentAmount,
            targetMonths: input.targetMonths,
            isActive: goal.isActive,
          },
        },
        {
          onSuccess: () => {
            const meta = goalEditRequest.meta
            if (meta) {
              void logAdvisorInteraction({
                familyId,
                signalId: meta.taskId,
                outcome: 'acted',
                surface: meta.surface,
                context: {
                  ...meta.context,
                  newGoalAmount: safeGoalAmount,
                  newTargetMonths: input.targetMonths,
                },
                timeToActionMs: meta.timeToActionMs,
              })
            }
            clearPendingAdvisorAction()
            Alert.alert('Meta actualizada', 'Guardamos los cambios.')
          },
          onError: () => {
            void triggerHaptic('error')
            Alert.alert(
              'No pudimos guardar',
              'Reintenta en unos segundos.',
            )
          },
        },
      )
    },
    [goalEditRequest, goal, upsertGoalMutation, router, familyId],
  )

  // ─── Fixed expense edit ───────────────────────────────────────
  const updateFixedMutation = useUpdateFixedExpense(familyId)
  const fixedEditRequest =
    pending?.type === 'fixed-expense-edit' ? pending : null
  const handleSubmitFixedEdit = useCallback(
    (input: { name: string; amount: number }) => {
      if (!fixedEditRequest || !targetFixedExpense) return
      const safeAmount = Math.max(0, Math.round(input.amount))
      if (safeAmount <= 0) return
      void triggerHaptic('selection')
      // Preserve every field the editor screen would have preserved,
      // overwriting only what the quick sheet exposes (name + amount).
      updateFixedMutation.mutate(
        {
          fixedExpenseId: targetFixedExpense.id,
          name: input.name,
          amount: safeAmount,
          categoryId: targetFixedExpense.category_id ?? '',
          dayOfMonth: targetFixedExpense.day_of_month,
          endsOn: targetFixedExpense.ends_on,
          frequency: targetFixedExpense.frequency,
          installmentsPaid: targetFixedExpense.installments_paid,
          installmentsTotal: targetFixedExpense.installments_total,
          kind: targetFixedExpense.kind,
          lenderName: targetFixedExpense.lender_name,
          nextDueOn: targetFixedExpense.next_due_on,
          notes: targetFixedExpense.notes,
          notifyDaysBefore: targetFixedExpense.notify_days_before,
          remainingBalance: targetFixedExpense.remaining_balance,
          status: targetFixedExpense.status,
        },
        {
          onSuccess: () => {
            const meta = fixedEditRequest.meta
            if (meta) {
              void logAdvisorInteraction({
                familyId,
                signalId: meta.taskId,
                outcome: 'acted',
                surface: meta.surface,
                context: {
                  ...meta.context,
                  newAmount: safeAmount,
                  fixedExpenseId: targetFixedExpense.id,
                },
                timeToActionMs: meta.timeToActionMs,
              })
            }
            clearPendingAdvisorAction()
            Alert.alert('Gasto fijo actualizado', 'Guardamos los cambios.')
          },
          onError: () => {
            void triggerHaptic('error')
            Alert.alert(
              'No pudimos guardar',
              'Reintenta en unos segundos.',
            )
          },
        },
      )
    },
    [fixedEditRequest, targetFixedExpense, updateFixedMutation, familyId],
  )

  // ─── Fixed expense add ────────────────────────────────────────
  const createFixedMutation = useCreateFixedExpense(familyId)
  const fixedAddRequest =
    pending?.type === 'fixed-expense-add' ? pending : null
  const handleSubmitFixedAdd = useCallback(
    (input: { name: string; amount: number; categoryId: string }) => {
      if (!fixedAddRequest) return
      const safeAmount = Math.max(0, Math.round(input.amount))
      if (safeAmount <= 0) return
      const today = new Date()
      const isoDate = today.toISOString().slice(0, 10)
      void triggerHaptic('selection')
      createFixedMutation.mutate(
        {
          name: input.name,
          amount: safeAmount,
          categoryId: input.categoryId,
          dayOfMonth: today.getUTCDate(),
          frequency: 'monthly',
          kind: 'recurring',
          nextDueOn: isoDate,
          status: 'active',
        },
        {
          onSuccess: () => {
            const meta = fixedAddRequest.meta
            if (meta) {
              void logAdvisorInteraction({
                familyId,
                signalId: meta.taskId,
                outcome: 'acted',
                surface: meta.surface,
                context: {
                  ...meta.context,
                  registeredAmount: safeAmount,
                  registeredName: input.name,
                },
                timeToActionMs: meta.timeToActionMs,
              })
            }
            clearPendingAdvisorAction()
            Alert.alert('Gasto fijo registrado', 'Lo guardamos en tu lista.')
          },
          onError: () => {
            void triggerHaptic('error')
            Alert.alert(
              'No pudimos registrar',
              'Reintenta en unos segundos.',
            )
          },
        },
      )
    },
    [fixedAddRequest, createFixedMutation, familyId],
  )

  // Top-level host yields rendering to a nested instance when one
  // is active (Asistente screen). The data hooks above stay mounted
  // either way, so React Query's cache stays warm.
  if (!isNested && hasNested) {
    return null
  }

  return (
    <>
      <QuickAddSavingsSheet
        // Show whenever a savings request is pending AND a goal
        // exists. The "no active goal" branch is handled by the
        // useEffect above, which routes to /savings-goal and clears
        // the request — so by the time we reach the JSX with `goal
        // !== null`, the sheet is meaningful.
        visible={savingsRequest !== null && goal !== null && goal.isActive}
        goalTitle={goal?.title ?? 'Tu meta'}
        remaining={savingsRemaining}
        initialAmount={savingsRequest?.amount}
        isSaving={addContributionMutation.isPending}
        onClose={clearPendingAdvisorAction}
        onSubmit={handleSubmitSavings}
        // When this host lives INSIDE the asistente stack-modal, ask
        // the sheet to render inline (no native `<Modal>`). iOS
        // otherwise stacks two UIVCs and dismissing the inner one
        // takes 150-250ms before touches return to the asistente CTA.
        inline={isNested}
      />
      <MemberWarningSheet
        visible={warningRequest !== null}
        targetDisplayName={targetMember?.displayName ?? null}
        targetAvatarSlug={targetMember?.avatarSlug ?? null}
        initialMessage={warningRequest?.message ?? ''}
        isSending={warningMutation.isPending}
        onClose={clearPendingAdvisorAction}
        onSubmit={handleSubmitWarning}
        inline={isNested}
      />
      <SavingsGoalQuickEditSheet
        visible={
          goalEditRequest !== null && goal !== null && goal.isActive
        }
        goalTitle={goal?.title ?? 'Tu meta'}
        goalEmoji={goal?.emoji ?? '🎯'}
        initialGoalAmount={goal?.goalAmount ?? 0}
        initialTargetMonths={goal?.targetMonths ?? null}
        currentAmount={goal?.currentAmount ?? 0}
        isSaving={upsertGoalMutation.isPending}
        onClose={clearPendingAdvisorAction}
        onSubmit={handleSubmitGoalEdit}
        inline={isNested}
      />
      <FixedExpenseQuickEditSheet
        visible={fixedEditRequest !== null && targetFixedExpense !== null}
        initialName={targetFixedExpense?.name ?? ''}
        initialAmount={targetFixedExpense?.amount ?? 0}
        isSaving={updateFixedMutation.isPending}
        onClose={clearPendingAdvisorAction}
        onSubmit={handleSubmitFixedEdit}
        inline={isNested}
      />
      <AddFixedQuickSheet
        visible={fixedAddRequest !== null}
        initialName={fixedAddRequest?.description ?? ''}
        initialAmount={fixedAddRequest?.amount ?? null}
        categories={categories}
        isCategoriesLoading={categoriesQuery.isLoading}
        isSaving={createFixedMutation.isPending}
        onClose={clearPendingAdvisorAction}
        onSubmit={handleSubmitFixedAdd}
        inline={isNested}
      />
    </>
  )
}
