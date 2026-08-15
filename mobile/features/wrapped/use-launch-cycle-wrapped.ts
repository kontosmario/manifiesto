import { useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { triggerCycleWrapped, type CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { useMarkCycleWrappedSeen } from '@/features/wrapped/use-mark-cycle-wrapped-seen'
import { fetchPastLeftoverDecision } from '@/features/wrapped/fetch-past-leftover-decision'
import { fetchWrappedShelf } from '@/features/wrapped/fetch-wrapped-shelf'
import { useMyFamilyRole } from '@/features/family/use-my-family-role'
import { useApplyMonthCloseDecision } from '@/features/month-close/use-month-close-decision'
import {
  computeSobranteFromSummary,
  cycleIncomeFromSummary,
  sobranteThreshold,
} from '@/features/month-close/sobrante'
import { useMonthlyAccounting } from '@/hooks/use-monthly-accounting'
import { useLatestSavingsGoal } from '@/features/savings-goals/use-latest-savings-goal'
import { formatLocalDateKey } from '@/utils/pay-cycle'

/**
 * Replay del cierre de ciclo (wrapped) con la decisión del sobrante
 * integrada (Spec B) — EXTRAÍDO 1:1 del `launchWrapped` que vivía inline
 * en `control-v2-screen.tsx` para que la vista neo de Control lo monte
 * sin duplicar el enriquecimiento (query directa a `monthly_summaries` +
 * `month_close_decisions` para evitar cache stale; fórmula canónica del
 * sobrante con extra_income − savings_goal_amount, fix 2026-06-22).
 *
 * La pantalla vieja conserva su copia local mientras exista — si tocás
 * la lógica acá, revisá si aquella sigue montada en alguna ruta.
 */
export function useLaunchCycleWrapped(input: {
  familyId: string
  userId: string
  wrappedPayload: CycleWrappedPayload | null
  wrappedSummaryId: string | null
  wrappedSeen: boolean
}): { launchWrapped: () => Promise<void>; hasWrapped: boolean } {
  const { familyId, userId, wrappedPayload, wrappedSummaryId, wrappedSeen } = input
  const markWrappedSeen = useMarkCycleWrappedSeen(familyId)
  const applyDecision = useApplyMonthCloseDecision(familyId, userId)
  const monthlyAccounting = useMonthlyAccounting(familyId)
  const savingsGoalQuery = useLatestSavingsGoal(familyId)

  // Rol para el gate de UI de la decisión (el RPC es owner-only).
  const roleQuery = useMyFamilyRole(userId, familyId)
  const canDecide = roleQuery.data === 'owner'

  const activeGoalForWrapped = useMemo(() => {
    const g = savingsGoalQuery.data
    if (!g) return null
    if (g.isActive === false) return null
    // Montos incluidos: la barra de progreso de la opción "Destinar a mi
    // meta" del wrapped (pantalla 06) los necesita.
    return {
      id: g.id,
      title: g.title,
      emoji: g.emoji,
      currentAmount: g.currentAmount,
      goalAmount: g.goalAmount,
    }
  }, [savingsGoalQuery.data])

  const launchWrapped = useCallback(async () => {
    if (!wrappedPayload) return
    let enrichedPayload = wrappedPayload
    if (wrappedSummaryId) {
      const [summaryRes, past, shelfData] = await Promise.all([
        supabase
          .from('monthly_summaries')
          .select('monthly_income, extra_income, total_spent, savings_goal_amount')
          .eq('id', wrappedSummaryId)
          .maybeSingle(),
        fetchPastLeftoverDecision(wrappedSummaryId),
        fetchWrappedShelf(familyId, wrappedSummaryId),
      ])
      // Contexto del rediseño (ordinal, estantería, reserva, rol) — se
      // adjunta SIEMPRE, tanto en replay read-only como en pending.
      enrichedPayload = {
        ...enrichedPayload,
        editionNumber: shelfData?.editionNumber ?? null,
        previousCycle: shelfData?.previous[0] ?? null,
        reserveAvailable: shelfData?.reserveAvailable ?? null,
        shelf: shelfData
          ? {
              previous: shelfData.previous,
              accumulatedSaved: shelfData.accumulatedSaved,
              totalEditions: shelfData.totalEditions,
            }
          : null,
        canDecide,
      }
      const summary = summaryRes.data as
        | {
            monthly_income: number | string
            extra_income: number | string
            total_spent: number | string
            savings_goal_amount: number | string
          }
        | null
      const sobrante = summary ? computeSobranteFromSummary(summary) : 0
      if (past) {
        enrichedPayload = {
          ...enrichedPayload,
          pastLeftoverDecision: past,
        }
      } else if (
        summary &&
        sobrante >= sobranteThreshold(cycleIncomeFromSummary(summary))
      ) {
        enrichedPayload = {
          ...enrichedPayload,
          pendingLeftoverDecision: {
            monthlySummaryId: wrappedSummaryId,
            sobrante,
          },
          activeGoal: activeGoalForWrapped,
          nextCycleAnchor: formatLocalDateKey(monthlyAccounting.start),
          onApplyLeftoverDecision: async (decisionInput) => {
            await applyDecision.mutateAsync(decisionInput)
          },
        }
      }
    }
    triggerCycleWrapped(enrichedPayload)
    if (wrappedSummaryId && !wrappedSeen) {
      markWrappedSeen.mutate(wrappedSummaryId)
    }
  }, [
    wrappedPayload,
    wrappedSummaryId,
    wrappedSeen,
    markWrappedSeen,
    applyDecision,
    activeGoalForWrapped,
    monthlyAccounting,
    familyId,
    canDecide,
  ])

  return { launchWrapped, hasWrapped: wrappedPayload != null }
}
