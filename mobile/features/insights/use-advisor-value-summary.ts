// Asistente Financiero — valor demostrado (read-side hook).
//
// Lee la view `public.advisor_value_summary` (security_invoker, RLS por
// familia) con el ahorro REALIZADO que el asistente ayudó a generar. Los
// datos los escribe `logAdvisorValue` desde el cliente (3 call-sites) hacia
// `advisor_value_log`; la view los agrega por usuario. Hasta esta pantalla,
// NADIE leía estos datos.
//
// Degrada a empty (todo 0) si la view no existe o la query falla — la UI
// oculta la card cuando no hay ahorro, así que un usuario nuevo no ve $0.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface AdvisorValueSummary {
  savedMonth: number
  savedQuarter: number
  totalActions: number
  distinctFamilies: number
}

export const EMPTY_ADVISOR_VALUE: AdvisorValueSummary = {
  savedMonth: 0,
  savedQuarter: 0,
  totalActions: 0,
  distinctFamilies: 0,
}

const STALE_TIME = 5 * 60_000

export function useAdvisorValueSummary(userId: string | null | undefined) {
  return useQuery<AdvisorValueSummary>({
    queryKey: ['advisor-value-summary', userId ?? null] as const,
    enabled: Boolean(userId),
    staleTime: STALE_TIME,
    queryFn: async () => {
      if (!userId) return EMPTY_ADVISOR_VALUE
      try {
        const { data, error } = await supabase
          .from('advisor_value_summary')
          .select('saved_month, saved_quarter, total_actions, distinct_signal_families')
          .eq('user_id', userId)
          .maybeSingle()
        if (error || !data) return EMPTY_ADVISOR_VALUE
        const row = data as {
          saved_month: number | string | null
          saved_quarter: number | string | null
          total_actions: number | string | null
          distinct_signal_families: number | string | null
        }
        return {
          savedMonth: Number(row.saved_month) || 0,
          savedQuarter: Number(row.saved_quarter) || 0,
          totalActions: Number(row.total_actions) || 0,
          distinctFamilies: Number(row.distinct_signal_families) || 0,
        }
      } catch {
        return EMPTY_ADVISOR_VALUE
      }
    },
  })
}
