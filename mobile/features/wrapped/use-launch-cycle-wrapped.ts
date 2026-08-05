import { useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { triggerCycleWrapped, type CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { useMarkCycleWrappedSeen } from '@/features/wrapped/use-mark-cycle-wrapped-seen'
import { useApplyMonthCloseDecision } from '@/features/month-close/use-month-close-decision'
import { computeSobranteFromSummary } from '@/features/month-close/sobrante'
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

  const activeGoalForWrapped = useMemo(() => {
    const g = savingsGoalQuery.data
    if (!g) return null
    if (g.isActive === false) return null
    return { id: g.id, title: g.title, emoji: g.emoji }
  }, [savingsGoalQuery.data])

  const launchWrapped = useCallback(async () => {
    if (!wrappedPayload) return
    let enrichedPayload = wrappedPayload
    if (wrappedSummaryId) {
      const [summaryRes, existingRes] = await Promise.all([
        supabase
          .from('monthly_summaries')
          .select('monthly_income, extra_income, total_spent, savings_goal_amount')
          .eq('id', wrappedSummaryId)
          .maybeSingle(),
        supabase
          .from('month_close_decisions')
          .select('id, decision, sobrante, decided_at, meta_goal_id')
          .eq('monthly_summary_id', wrappedSummaryId)
          .maybeSingle(),
      ])
      const summary = summaryRes.data as
        | {
            monthly_income: number | string
            extra_income: number | string
            total_spent: number | string
            savings_goal_amount: number | string
          }
        | null
      const sobrante = summary ? computeSobranteFromSummary(summary) : 0
      if (existingRes.data) {
        const dec = existingRes.data as {
          decision: 'meta' | 'acumular' | 'reserva' | 'skip'
          sobrante: number | string
          decided_at: string
          meta_goal_id: string | null
        }
        let metaGoalTitle: string | null = null
        if (dec.decision === 'meta' && dec.meta_goal_id) {
          const { data: goal } = await supabase
            .from('savings_goals')
            .select('title')
            .eq('id', dec.meta_goal_id)
            .maybeSingle()
          metaGoalTitle = (goal as { title?: string } | null)?.title ?? null
        }
        enrichedPayload = {
          ...wrappedPayload,
          pastLeftoverDecision: {
            decision: dec.decision,
            sobrante: Number(dec.sobrante),
            metaGoalTitle,
            decidedAt: dec.decided_at,
          },
        }
      } else if (sobrante >= 1000) {
        enrichedPayload = {
          ...wrappedPayload,
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
  ])

  return { launchWrapped, hasWrapped: wrappedPayload != null }
}
