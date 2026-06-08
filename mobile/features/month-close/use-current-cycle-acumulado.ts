import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface CycleAcumulado {
  /** Sobrante (>0) acumulado del cycle anterior, calculado vía RPC al
   *  momento de la decisión. */
  amount: number
  /** Etiqueta humana del periodo cerrado (e.g. "Mayo 2026"). */
  periodLabel: string
}

export const cycleAcumuladoQueryKey = (
  familyId?: string,
  currentCycleAnchor?: string | null,
) => ['cycle-acumulado', familyId, currentCycleAnchor ?? null] as const

interface SummaryEmbed {
  period_label: string
  period_end: string
  monthly_income: number | string
  total_spent: number | string
  savings_delta: number | string
}

interface DecisionWithSummaryRow {
  decided_at: string
  monthly_summary: SummaryEmbed | SummaryEmbed[] | null
}

/**
 * Pure fetcher exportado para testeo. Separa la query de la composición
 * react-query. Devuelve `null` cuando no hay match o no se cumple el
 * gating (sin familyId / anchor / decisión / sobrante > 0).
 */
export async function fetchCurrentCycleAcumulado(
  familyId: string | undefined,
  currentCycleAnchor: string | null | undefined,
): Promise<CycleAcumulado | null> {
  if (!familyId || !currentCycleAnchor) return null
  // 1 query con embed implícito vía FK (month_close_decisions →
  // monthly_summaries). Antes hacíamos 2 selects encadenados; el
  // embed colapsa el round-trip en uno solo. Mantenemos el sort por
  // decided_at y el limit(1) — la primera fila ya viene con su
  // summary join-eado.
  const { data, error } = await supabase
    .from('month_close_decisions')
    .select(`
      decided_at,
      monthly_summary:monthly_summaries(
        period_label,
        period_end,
        monthly_income,
        total_spent,
        savings_delta
      )
    `)
    .eq('family_id', familyId)
    .eq('decision', 'acumular')
    .order('decided_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  const row = data as DecisionWithSummaryRow | null
  // PostgREST devuelve la relación many-to-one como objeto directo
  // (no array), pero algunos typings inferidos la tratan como array.
  // Normalizamos defensivamente.
  const rawSummary = row?.monthly_summary
  const summary = Array.isArray(rawSummary) ? (rawSummary[0] ?? null) : rawSummary ?? null
  if (!summary) return null

  // Match estricto: el anchor del current cycle debe coincidir con
  // el `period_end` (= primer día del cycle siguiente) del summary
  // origen. Si no matchea, esta decisión es vieja o pertenece a
  // otro cycle y no aplica al saldo actual.
  if (summary.period_end !== currentCycleAnchor) return null

  // Reconstruimos el sobrante con la misma fórmula que usa
  // useMonthCloseDecisionPending (clampeado >= 0). El RPC ya hizo
  // su propia versión al persistir, pero no guardó el monto, así
  // que lo derivamos del summary aquí.
  const sobrante = Math.max(
    0,
    Number(summary.monthly_income ?? 0)
      - Number(summary.total_spent ?? 0)
      - Number(summary.savings_delta ?? 0),
  )
  if (sobrante <= 0) return null
  return {
    amount: sobrante,
    periodLabel: summary.period_label,
  }
}

/**
 * Detecta si el `current_cycle_starting_balance` que ve el dashboard
 * proviene de una decisión "acumular" del mes anterior — y en ese caso
 * devuelve el monto + label del periodo de origen para mostrar contexto
 * positivo en el hero ("+$X acumulado de mayo") en lugar del chip
 * neutral "Ajustado para este mes".
 *
 * Convención del match: el trigger DB crea `monthly_summaries` con
 * `period_end` igual al primer día del cycle siguiente (exclusivo). El
 * RPC `apply_month_close_decision` setea `current_cycle_anchor` exacto
 * a ese mismo valor cuando la decisión es "acumular". Por lo tanto la
 * regla de match es estricta: `anchor === summary.period_end`.
 *
 * Self-correcting: cuando el user confirma el cobro del próximo cycle
 * el anchor avanza y la decisión vieja deja de matchear → el hook
 * devuelve `null` automáticamente sin necesidad de schema extra.
 */
export function useCurrentCycleAcumulado(
  familyId?: string,
  currentCycleAnchor?: string | null,
): CycleAcumulado | null {
  const query = useQuery({
    queryKey: cycleAcumuladoQueryKey(familyId, currentCycleAnchor),
    enabled: Boolean(familyId) && Boolean(currentCycleAnchor),
    // El acumulado del cycle vigente no muta mid-cycle: una vez que el
    // user decidió "acumular", el monto y el label del periodo origen
    // son inmutables hasta que el cycle siguiente arranque y mute el
    // anchor (invalidando el cache key). Cache 5min mientras tanto.
    staleTime: 5 * 60_000,
    queryFn: () => fetchCurrentCycleAcumulado(familyId, currentCycleAnchor),
  })

  return query.data ?? null
}
