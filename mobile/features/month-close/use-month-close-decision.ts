import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { financeToCycleConfig } from '@/utils/finance-cycle-config'
import { computeMonthlyAccountingWindow } from '@/utils/monthly-accounting'
import { computeMonthCloseSobrante } from '@/utils/month-close-sobrante'
import { formatLocalDateKey, normalizeToStartOfDay } from '@/utils/pay-cycle'

/**
 * Below this threshold no prompteamos — la fricción del sheet no
 * vale la pena para < $1k de sobrante.
 */
const SOBRANTE_THRESHOLD = 1000

export const monthCloseDecisionQueryKey = (familyId?: string, monthIso?: string) =>
  ['month-close-decision', familyId, monthIso] as const

export interface PendingDecision {
  monthIso: string
  sobrante: number
  lastMonthStart: Date
  lastMonthEnd: Date
}

/**
 * Devuelve la decisión pendiente del mes pasado, o null si:
 *  - el familyId no está listo
 *  - el sobrante está debajo del threshold
 *  - el sobrante fue 0 o negativo (clamp)
 *  - ya existe un registro en `month_close_decisions` para ese mes
 */
export function useMonthCloseDecisionPending(familyId?: string): PendingDecision | null {
  const finance = useFamilyFinance(familyId)
  const dashboard = useFamilyDashboard(familyId)
  const today = useMemo(() => normalizeToStartOfDay(new Date()), [])

  const lastMonth = useMemo(() => {
    const config = financeToCycleConfig(finance.data)
    const currentMa = computeMonthlyAccountingWindow(config, today)
    const beforeCurrent = new Date(currentMa.start)
    beforeCurrent.setDate(beforeCurrent.getDate() - 1)
    return computeMonthlyAccountingWindow(config, beforeCurrent)
  }, [finance.data, today])

  const monthIso = formatLocalDateKey(lastMonth.start)

  const decisionQuery = useQuery({
    queryKey: monthCloseDecisionQueryKey(familyId, monthIso),
    enabled: Boolean(familyId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!familyId) return null
      const { data, error } = await supabase
        .from('month_close_decisions')
        .select('id, decision')
        .eq('family_id', familyId)
        .eq('month_iso', monthIso)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  if (decisionQuery.data) return null

  const expenses = dashboard.expensesQuery.data ?? []
  const monthlyIncome = dashboard.familyFinanceQuery.data?.monthly_income ?? 0
  const sobrante = computeMonthCloseSobrante({
    lastMonthStart: lastMonth.start,
    lastMonthEnd: lastMonth.end,
    monthlyIncome,
    expenses,
    savingsContributedThisMonth: 0, // V1: no se trackea por separado
  })

  if (sobrante < SOBRANTE_THRESHOLD) return null
  return {
    monthIso,
    sobrante,
    lastMonthStart: lastMonth.start,
    lastMonthEnd: lastMonth.end,
  }
}

export interface ApplyDecisionInput {
  monthIso: string
  sobrante: number
  decision: 'meta' | 'acumular' | 'reserva' | 'skip'
  metaGoalId?: string
  newCycleAnchor?: string
}

export function useApplyMonthCloseDecision(familyId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ApplyDecisionInput) => {
      if (!familyId) throw new Error('familyId requerido')
      const { error } = await supabase.rpc('apply_month_close_decision', {
        p_family_id: familyId,
        p_month_iso: input.monthIso,
        p_sobrante: input.sobrante,
        p_decision: input.decision,
        p_meta_goal_id: input.metaGoalId ?? null,
        p_new_cycle_anchor: input.newCycleAnchor ?? null,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['month-close-decision', familyId] }),
        queryClient.invalidateQueries({ queryKey: ['family-finance', familyId] }),
        queryClient.invalidateQueries({ queryKey: ['savings-goal', familyId] }),
      ])
    },
  })
}
