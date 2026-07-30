// mobile/features/home/use-cycle-confirmation.ts
//
// FASE 0 del cableado del rediseño: lógica de confirmación del ciclo
// (saldo inicial) extraída LITERAL de home-screen.tsx y
// home-dashboard.tsx para que la Home vieja y la nueva (neo) consuman
// exactamente el mismo comportamiento. Cero cambios de lógica.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { TFunction } from 'i18next'
import {
  buildCycleStartingBalanceInput,
  useUpsertFamilyFinance,
} from '@/features/finance/use-family-finance'
import { useMyFamilyRole } from '@/features/family/use-my-family-role'
import type { FamilyDashboard } from '@/hooks/use-family-dashboard'
import { formatLocalDateKey } from '@/utils/pay-cycle'
import { triggerHaptic } from '@/lib/haptics'
import { getErrorMessage } from '@/utils/error-message'

interface UseCycleConfirmationParams {
  dashboard: FamilyDashboard
  familyId: string
  userId: string
  t: TFunction
}

/**
 * Screen-side half (vive en HomeScreen): mutation de upsert + estado de
 * error + hápticos del confirm. `confirmCycleStartingBalance` /
 * `salaryErrorMessage` / `isSavingSalary` conservan el mismo shape que
 * viajaba por props hacia HomeDashboard.
 */
export function useCycleConfirmation({
  dashboard,
  familyId,
  userId,
  t,
}: UseCycleConfirmationParams) {
  const [salaryErrorMessage, setSalaryErrorMessage] = useState<string | null>(null)
  const upsertFamilyFinanceMutation = useUpsertFamilyFinance(familyId, userId)

  // Persists the cycle confirmation. `startingBalance: number` =
  // user's adjusted available cash for THIS cycle (engine override).
  // `startingBalance: null` = user kept the default monthly_income;
  // we still anchor the cycle so we don't re-prompt this period.
  const confirmCycleStartingBalance = useCallback((startingBalance: number | null) => {
    setSalaryErrorMessage(null)
    // `cycleAnchorTarget` lands on `payCycle.start` in steady state
    // and pivots to `currentMonthPayDate` while the salary freeze is
    // active — see family-dashboard-model. Using it ensures the
    // prompt clears as soon as the freeze releases post-confirm.
    const cycleAnchor = formatLocalDateKey(dashboard.cycleAnchorTarget)
    upsertFamilyFinanceMutation.mutate(
      buildCycleStartingBalanceInput(
        {
          dailyBudgetBufferMode: dashboard.dailyBudgetBufferMode,
          dailyBudgetBufferValue: dashboard.dailyBudgetBufferValue,
          dailyBudgetCheckinHour: dashboard.dailyBudgetCheckinHour,
          dailyBudgetNudgesEnabled: dashboard.dailyBudgetNudgesEnabled,
          monthlyIncome: dashboard.monthlyIncome,
          savingsGoal: dashboard.savingsGoal,
          savingsGoalPercent:
            dashboard.familyFinanceQuery.data?.savings_goal_percent ?? 20,
          usdExchangeRate: dashboard.usdExchangeRate,
          salaryPaymentDay: dashboard.salaryPaymentDay,
          lastSalaryConfirmedAt:
            dashboard.familyFinanceQuery.data?.last_salary_confirmed_at ?? null,
          currentCycleStartingBalance:
            dashboard.familyFinanceQuery.data?.current_cycle_starting_balance ?? null,
          currentCycleAnchor:
            dashboard.familyFinanceQuery.data?.current_cycle_anchor ?? null,
          cycleType: 'monthly',
          cycleAnchorDate: null,
          cycleLengthDays: null,
        },
        cycleAnchor,
        startingBalance,
      ),
      {
        onError: (error: unknown) => {
          setSalaryErrorMessage(getErrorMessage(error, t('states:error.server')))
          void triggerHaptic('error')
        },
        onSuccess: () => {
          void triggerHaptic('success')
        },
      },
    )
  }, [
    dashboard.cycleAnchorTarget,
    dashboard.dailyBudgetBufferMode,
    dashboard.dailyBudgetBufferValue,
    dashboard.dailyBudgetCheckinHour,
    dashboard.dailyBudgetNudgesEnabled,
    dashboard.monthlyIncome,
    dashboard.savingsGoal,
    dashboard.familyFinanceQuery.data?.savings_goal_percent,
    dashboard.usdExchangeRate,
    dashboard.salaryPaymentDay,
    dashboard.familyFinanceQuery.data?.last_salary_confirmed_at,
    dashboard.familyFinanceQuery.data?.current_cycle_starting_balance,
    dashboard.familyFinanceQuery.data?.current_cycle_anchor,
    upsertFamilyFinanceMutation,
  ])

  return {
    confirmCycleStartingBalance,
    salaryErrorMessage,
    isSavingSalary: upsertFamilyFinanceMutation.isPending,
  }
}

interface UseCycleSheetAutoOpenParams {
  dashboard: FamilyDashboard
  familyId: string
  sessionUserId: string | undefined
  /** `storedCycleAnchor == null` (modo fijo) — ver derivación en el consumidor. */
  isOnboardingFlow: boolean
  /** Onboarding dropeado agregando un gasto — ver derivación en el consumidor. */
  onboardingSkippedViaExpense: boolean
  /** Payday llegó y el cobro no está confirmado (`isPaydayPending`). */
  pending: boolean
  /** Gate compartido: ningún sheet aparece con el overlay de transición visible. */
  splashIsHidden: boolean
  onConfirmCycleStartingBalance: (startingBalance: number | null) => void
  setCycleBalanceSheetOpen: Dispatch<SetStateAction<boolean>>
  /**
   * `false` en la ruta dev de preview de la Home neo (`preview`): con la
   * Home vieja live montada en paralelo (freezeOnBlur:false), este hook
   * corre en DOS instancias y sus efectos side-effectful colisionan
   * (doble silent-anchor de `family_finance`, doble auto-open del sheet).
   * Gateando en `enabled` la instancia de preview no dispara ninguno de
   * los dos efectos. Default `true` (comportamiento live intacto).
   */
  enabled?: boolean
}

/**
 * Dashboard-side half (vive en HomeDashboard): silent-anchor del
 * onboarding dropeado + gating y auto-open del cycle balance sheet.
 */
export function useCycleSheetAutoOpen({
  dashboard,
  familyId,
  sessionUserId,
  isOnboardingFlow,
  onboardingSkippedViaExpense,
  pending,
  splashIsHidden,
  onConfirmCycleStartingBalance,
  setCycleBalanceSheetOpen,
  enabled = true,
}: UseCycleSheetAutoOpenParams) {
  // Ownership gate: shared `family_finance` is owner-only at the RLS layer.
  // Only the owner may run the silent cycle-anchor write below.
  const isFamilyOwner = useMyFamilyRole(sessionUserId, familyId).data === 'owner'

  // Side-effect: when the user dropped the onboarding sheet by
  // adding an expense, write a neutral cycle anchor in the
  // background. Same backend payload as tapping "Tengo el sueldo
  // completo" on the modal (balance=null, anchor=cycleAnchorTarget,
  // lastSalaryConfirmedAt=now). Refetch flips the condition off so
  // this effect fires at most once per dropped onboarding.
  const silentAnchorWroteRef = useRef(false)
  useEffect(() => {
    // Preview (Home neo dev-route): la Home vieja live ya corre este
    // efecto; no duplicamos el upsert de `family_finance`.
    if (!enabled) return
    if (!onboardingSkippedViaExpense) {
      silentAnchorWroteRef.current = false
      return
    }
    if (silentAnchorWroteRef.current) return
    // Only the owner may persist shared family_finance (RLS owner-only). For a
    // non-owner the write 42501s but the upsert reports it as a fallback
    // "success", which reset this guard and spun a ~1-req/sec retry storm.
    // Gating on ownership stops non-owners from ever firing it. (Owners wait for
    // the role query; a transient role-query failure defers the silent write to
    // the next mount — acceptable vs. the storm.)
    if (!isFamilyOwner) return
    if (dashboard.familyFinanceQuery.isLoading) return
    if (dashboard.expensesQuery.isLoading) return
    silentAnchorWroteRef.current = true
    onConfirmCycleStartingBalance(null)
  }, [
    enabled,
    onboardingSkippedViaExpense,
    isFamilyOwner,
    dashboard.familyFinanceQuery.isLoading,
    dashboard.expensesQuery.isLoading,
    onConfirmCycleStartingBalance,
  ])

  const shouldAutoOpenCycleSheet =
    dashboard.isCycleStartingBalancePromptPending &&
    !dashboard.familyFinanceQuery.isLoading &&
    Boolean(dashboard.familyFinanceQuery.data) &&
    dashboard.monthlyIncome > 0 &&
    // For users already in the recurring loop, only auto-open the
    // salary-confirmation prompt once payday has actually arrived
    // this cycle and the user hasn't confirmed yet (`pending`).
    // Without this gate, editing `salary_payment_day` in Settings
    // recomputes `cycleAnchorTarget`, the previous anchor stops
    // matching, and the prompt fires mid-cycle even though the new
    // payday is still in the future. Onboarding flow is exempt:
    // those users haven't anchored a cycle yet, so we always ask.
    (isOnboardingFlow || pending) &&
    // Once the onboarding sheet has been dropped via an expense,
    // we silently anchor the cycle (effect above) — never reopen.
    !onboardingSkippedViaExpense
  useEffect(() => {
    // Preview (Home neo dev-route): no auto-abrimos el sheet — la Home
    // vieja live ya orquesta este flujo.
    if (!enabled) return
    if (!shouldAutoOpenCycleSheet) return
    // Gate: esperar a que el auth-transition splash termine. Sino el
    // sheet aparece sobre el fern entrance — mismo bug que tenía la
    // decisión standalone, resuelto con el mismo enfoque.
    if (!splashIsHidden) return
    // Wait for the dashboard's hero + cards to finish their RiseView
    // entrance animations (the longest delay in the chain is ~320ms;
    // we add some padding so the screen "settles" first). Letting
    // the user register the dashboard before the sheet emerges makes
    // the prompt feel like a soft follow-up instead of an ambush —
    // and gives us a clean spring-up motion underneath.
    const handle = setTimeout(() => {
      void triggerHaptic('selection')
      setCycleBalanceSheetOpen(true)
    }, 650)
    return () => clearTimeout(handle)
  }, [enabled, shouldAutoOpenCycleSheet, splashIsHidden, setCycleBalanceSheetOpen])

  return { shouldAutoOpenCycleSheet }
}
