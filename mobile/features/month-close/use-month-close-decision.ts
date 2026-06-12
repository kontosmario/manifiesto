import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { syncAllAfterMutation } from '@/lib/sync-after-mutation'
import {
  computeSobranteFromSummary,
  SOBRANTE_THRESHOLD,
} from '@/features/month-close/sobrante'

export const monthCloseDecisionQueryKey = (familyId?: string) =>
  ['month-close-decision', familyId] as const

export interface PendingDecision {
  /** ID del monthly_summaries row que generó este prompt. */
  monthlySummaryId: string
  /** Sobrante calculado desde el summary (clampeado >= 0). */
  sobrante: number
  /** Etiqueta del periodo (ej "Mayo 2026", "20 may → 19 jun"). */
  periodLabel: string
  /** Fechas del periodo cerrado para mostrar en el sheet. */
  periodStart: string  // YYYY-MM-DD
  periodEnd: string    // YYYY-MM-DD
}

interface PendingRow {
  id: string
  period_label: string
  period_start: string
  period_end: string
  monthly_income: number | string
  total_spent: number | string
  savings_goal_amount: number | string
}

/**
 * Detecta si hay un monthly_summaries row para esta familia que NO tiene
 * decisión persistida y cuyo sobrante supera el umbral. Retorna la más
 * reciente — si hay 2 cycles cerrados sin decidir, mostramos primero el
 * más nuevo (el más viejo queda pendiente para próxima sesión).
 *
 * Trigger natural: el row de monthly_summaries aparece cuando el user
 * confirma cobro (vía trigger trg_family_finance_on_salary_confirm).
 * Cliente solo lee y reacciona.
 */
export function useMonthCloseDecisionPending(familyId?: string): PendingDecision | null {
  const query = useQuery({
    queryKey: monthCloseDecisionQueryKey(familyId),
    enabled: Boolean(familyId),
    // staleTime: 0 + refetchOnMount: 'always' garantiza que al volver al
    // Home (e.g. tras confirmar cobro, que dispara el trigger DB que
    // crea el monthly_summaries row), el hook re-evalúa la presencia
    // de decisión pendiente. Sin esto, el cache stale enmascaraba el
    // nuevo summary y la sheet no aparecía.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<PendingRow | null> => {
      if (!familyId) return null
      // LEFT JOIN equivalente vía 2 queries simple (PostgREST no joina natural sin FK explícita en metadata).
      // 1) Traer summaries reciente sin decision matching.
      const { data: summaries, error: sErr } = await supabase
        .from('monthly_summaries')
        .select('id, period_label, period_start, period_end, monthly_income, total_spent, savings_goal_amount')
        .eq('family_id', familyId)
        .order('period_end', { ascending: false })
        .limit(3)
      if (sErr) throw sErr
      if (!summaries || summaries.length === 0) return null

      const ids = summaries.map((s) => s.id as string)
      const { data: decisions, error: dErr } = await supabase
        .from('month_close_decisions')
        .select('monthly_summary_id')
        .in('monthly_summary_id', ids)
      if (dErr) throw dErr
      const decided = new Set((decisions ?? []).map((d) => d.monthly_summary_id as string))

      for (const s of summaries) {
        if (!decided.has(s.id as string)) {
          return s as PendingRow
        }
      }
      return null
    },
  })

  if (!query.data) return null
  const row = query.data
  // Fórmula canónica — antes restaba `savings_delta` (que el server
  // define como el sobrante mismo) y daba 0 idéntico: la decisión no
  // se disparó nunca para ninguna familia. Ver sobrante.ts.
  const sobrante = computeSobranteFromSummary(row)
  if (sobrante < SOBRANTE_THRESHOLD) return null
  return {
    monthlySummaryId: row.id,
    sobrante,
    periodLabel: row.period_label,
    periodStart: row.period_start,
    periodEnd: row.period_end,
  }
}

export interface ApplyDecisionInput {
  monthlySummaryId: string
  decision: 'meta' | 'acumular' | 'reserva' | 'skip'
  metaGoalId?: string
  newCycleAnchor?: string
}

export function useApplyMonthCloseDecision(familyId?: string, userId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ApplyDecisionInput) => {
      const { error } = await supabase.rpc('apply_month_close_decision', {
        p_monthly_summary_id: input.monthlySummaryId,
        p_decision: input.decision,
        p_meta_goal_id: input.metaGoalId ?? null,
        p_new_cycle_anchor: input.newCycleAnchor ?? null,
      })
      if (error) throw error
    },
    // Code review H1 (sprint A, 2026-06-08): la decisión de month-close
    // puede mover plata a una savings goal, abrir un nuevo ciclo o
    // tocar reserva. `syncAllAfterMutation` con scopes
    // `savings`+`income`+`wrapped` cubre family-finance, savings goals,
    // control snapshots, cycle-acumulado y monthly-editions del wrapped.
    // CR v3 (2026-06-08): se agrega `wrapped` para alinear con doc
    // canónico (`docs/arquitectura/sync-after-mutation-pattern.md`).
    // El invalidate hardcoded a `['monthly-summaries', familyId]` se
    // elimina — no hay useQuery que consuma ese key (verificado por
    // grep); el dato vive en los snapshots y se invalida por scopes.
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['month-close-decision', familyId],
        }),
        syncAllAfterMutation(queryClient, {
          familyId,
          userId,
          scopes: ['savings', 'income', 'wrapped'],
        }),
      ])
    },
  })
}
