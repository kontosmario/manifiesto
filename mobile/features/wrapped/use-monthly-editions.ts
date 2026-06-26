import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  controlIntelligenceQueryKey,
} from '@/features/insights/use-control-v2-data'
import type { MonthlySummaryHistory } from '@/features/insights/control-v2-adapter'

/**
 * Lee las "Ediciones" — ciclos cerrados de la familia ordenados por
 * fecha descendente. Es la primitiva detrás del archivo de Wrappeds
 * persistente (Settings → Tu progreso → Ediciones).
 *
 * Estrategia:
 *   1. Intenta leer del cache `controlIntelligenceQueryKey` (poblado
 *      por home_snapshot en cold start + por la salary confirmation
 *      flow). Si está, devolvemos sin tocar red.
 *   2. Si no, fetcheia hasta 12 ciclos (vs 6 del control intelligence —
 *      aquí queremos un año completo para que el archivo crezca).
 *
 * Skipea ciclos vacíos (`expenses_count === 0`): no hay "edición" si
 * el mes no tuvo movimientos, lo cual mantiene consistencia con el
 * gate del trigger automático post-cobro.
 */

export { monthlyEditionsQueryKey } from '@/features/wrapped/monthly-editions-query-keys'
import { monthlyEditionsQueryKey } from '@/features/wrapped/monthly-editions-query-keys'

const EDITIONS_PAGE_SIZE = 12

async function fetchEditions(familyId: string): Promise<MonthlySummaryHistory[]> {
  const { data, error } = await supabase
    .from('monthly_summaries')
    .select(
      'id, period_start, period_end, period_label, total_variable_spent, total_spent, expenses_count, monthly_income, savings_delta, extra_income, savings_goal_amount, category_breakdown, daily_totals, top_expense, delta_vs_previous_percent, mood',
    )
    .eq('family_id', familyId)
    .order('period_start', { ascending: false })
    .limit(EDITIONS_PAGE_SIZE)
  if (error) throw error
  return (data as MonthlySummaryHistory[] | null) ?? []
}

export function useMonthlyEditions(familyId: string | undefined): {
  editions: MonthlySummaryHistory[]
  isLoading: boolean
  error: unknown
} {
  const queryClient = useQueryClient()

  // Si el control-intelligence query ya tiene summaries cargadas
  // (cold start del Home las pre-popula), las exponemos directamente —
  // evita una fetch extra cuando el usuario abre Ediciones desde
  // Settings sin haber tocado Control.
  const seedFromControlIntel = useMemo(() => {
    if (!familyId) return undefined
    const cached = queryClient.getQueryData<{
      summaries: MonthlySummaryHistory[]
    }>(controlIntelligenceQueryKey(familyId))
    return cached?.summaries
  }, [familyId, queryClient])

  const query = useQuery({
    queryKey: monthlyEditionsQueryKey(familyId),
    queryFn: () => fetchEditions(familyId!),
    enabled: Boolean(familyId),
    initialData: seedFromControlIntel,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })

  const editions = useMemo(() => {
    const raw = query.data ?? []
    return raw.filter((s) => (s.expenses_count ?? 0) > 0)
  }, [query.data])

  return {
    editions,
    isLoading: query.isLoading,
    error: query.error,
  }
}
