import { supabase } from '@/lib/supabase'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'

export type PastLeftoverDecision = NonNullable<
  CycleWrappedPayload['pastLeftoverDecision']
>

/**
 * Decisión del sobrante YA persistida para un summary — el enriquecimiento
 * que convierte un replay del wrapped en modo lectura (la opción elegida
 * marcada, las otras inertes).
 *
 * EXTRAÍDO del inline duplicado en `use-launch-cycle-wrapped` y
 * `use-month-close-orchestration`; lo consume también la pantalla de
 * Ediciones, que antes replayeaba el payload PELADO — una edición vieja
 * se abría como si la decisión nunca se hubiera tomado.
 *
 * Query directa (no cache): el replay es esporádico y el costo de un
 * round-trip vale la garantía de no mostrar una decisión stale.
 */
export async function fetchPastLeftoverDecision(
  monthlySummaryId: string,
): Promise<PastLeftoverDecision | null> {
  const { data: existing } = await supabase
    .from('month_close_decisions')
    .select('id, decision, sobrante, decided_at, meta_goal_id')
    .eq('monthly_summary_id', monthlySummaryId)
    .maybeSingle()
  if (!existing) return null
  const dec = existing as {
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
  return {
    decision: dec.decision,
    sobrante: Number(dec.sobrante),
    metaGoalTitle,
    decidedAt: dec.decided_at,
  }
}
