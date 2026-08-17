import { supabase } from '@/lib/supabase'
import { gardenActivityWindowStartIso } from './garden-activity-window'

/** Lo mínimo que necesita `familyActivityWithCounts`: el día (de `created_at`),
 *  quién lo cargó y si fue el pago de un fijo (para los discrecionales). */
export interface GardenActivityRow {
  created_at: string
  created_by: string | null
  commitment_id: string | null
}

/**
 * Días con actividad del hogar para el jardín — la fuente PROPIA de la racha.
 *
 * ⚠️ NO filtra `archived_at`, y eso es el punto del archivo. `close_monthly_cycle`
 * marca como archivados TODOS los gastos del ciclo que cierra (correcto: evita
 * el doble conteo del ciclo siguiente), y `useExpenses` excluye archivados
 * porque su cache la siembra `home_snapshot` ya filtrada. Mientras el jardín se
 * colgó de esa fuente, confirmar un ciclo reescribía semanas enteras como "no
 * cargaste" aunque los gastos siguieran ahí (bug del owner 2026-08-17: 8
 * familias y 44 días visibles en prod).
 *
 * La racha es del HÁBITO, no del CICLO. El servidor ya lo define así —
 * `recompute_family_streak` recorre `public.expenses` sin mirar `archived_at`,
 * unido a `streak_marked_days` y `garden_recovered_days` — y esta consulta es
 * el espejo cliente de esa definición.
 *
 * Acotada por ventana (`gardenActivityWindowStartIso`) para no traerse el
 * historial completo: son 3 columnas y ~90 días.
 */
export async function fetchGardenActivity(
  familyId: string,
  today: Date = new Date(),
): Promise<GardenActivityRow[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('created_at, created_by, commitment_id')
    .eq('family_id', familyId)
    .gte('created_at', gardenActivityWindowStartIso(today))
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as GardenActivityRow[] | null) ?? []
}
