import { supabase } from '@/lib/supabase'
import {
  computeCycleSurplusSigned,
  type SobranteSummaryFields,
} from '@/features/month-close/sobrante'

/**
 * Datos de la contratapa del wrapped (pantalla 07 del rediseño):
 * ordinal de la edición, estantería de ediciones anteriores y el
 * acumulado histórico.
 *
 * SEMÁNTICA DEL ACUMULADO — decidida en el plan de integración (§6.7):
 * NO es la suma de saldos de cierre. Un `acumular` reinyecta el sobrante
 * como `extra_income` del ciclo siguiente, así que sumar saldos lo cuenta
 * dos veces (el código de Ediciones documenta y rechaza exactamente eso).
 * El acumulado honesto es lo que SALIÓ del circuito del ciclo: la suma de
 * sobrantes decididos a **reserva** o **meta**. Null cuando no hay ninguna
 * decisión de ese tipo → el listón de la estantería se oculta.
 *
 * Query directa en el momento del replay (no cache): igual criterio que
 * `fetchPastLeftoverDecision` — esporádico, y la garantía de frescura
 * vale el round-trip. Toda falla degrada a `null` (la contratapa se
 * renderiza sin estantería, nunca bloquea el wrapped).
 */

/** Ventana de conteo: 60 ediciones ≈ 5 años de ciclos mensuales. Una
 *  edición más vieja que esto pierde el ordinal (degrada al rango). */
const SHELF_WINDOW = 60

interface ShelfSummaryRow extends SobranteSummaryFields {
  id: string
  period_label: string
  period_start: string
}

export interface WrappedShelfData {
  /** Ordinal 1-based de la edición actual ("Nº 3"). Null si quedó fuera
   *  de la ventana de conteo. */
  editionNumber: number | null
  totalEditions: number
  /** Hasta 2 ediciones inmediatamente anteriores (más nueva primero),
   *  con su saldo firmado — las mini-cards de la estantería. */
  previous: Array<{ label: string; saldo: number }>
  /** Σ sobrantes decididos a reserva/meta. Null si no hay decisiones. */
  accumulatedSaved: number | null
  /** Reserva disponible del hogar (`family_finance.monthly_reserve_amount`)
   *  — la opción "cubrir con la reserva" del plan de recuperación. Null si
   *  la query falló; 0 real oculta la opción igual. */
  reserveAvailable: number | null
}

export async function fetchWrappedShelf(
  familyId: string,
  currentSummaryId: string,
): Promise<WrappedShelfData | null> {
  try {
    const [summariesRes, financeRes] = await Promise.all([
      supabase
        .from('monthly_summaries')
        .select(
          'id, period_label, period_start, monthly_income, extra_income, total_spent, savings_goal_amount',
          { count: 'exact' },
        )
        .eq('family_id', familyId)
        .order('period_start', { ascending: false })
        .limit(SHELF_WINDOW),
      supabase
        .from('family_finance')
        .select('monthly_reserve_amount')
        .eq('family_id', familyId)
        .maybeSingle(),
    ])
    const { data, count, error } = summariesRes
    if (error || !data) return null
    const reserveRaw = (
      financeRes.data as { monthly_reserve_amount?: number | string } | null
    )?.monthly_reserve_amount
    const reserveAvailable = reserveRaw == null ? null : Number(reserveRaw)

    const rows = data as ShelfSummaryRow[]
    const totalEditions = count ?? rows.length
    const idx = rows.findIndex((r) => r.id === currentSummaryId)
    // Ordinal = total − posición desde el más nuevo. Si la edición actual
    // no está en la ventana de conteo, sin ordinal.
    const editionNumber = idx >= 0 ? totalEditions - idx : null
    const previous =
      idx >= 0
        ? rows.slice(idx + 1, idx + 3).map((r) => ({
            label: r.period_label,
            saldo: computeCycleSurplusSigned(r),
          }))
        : []

    let accumulatedSaved: number | null = null
    const ids = rows.map((r) => r.id)
    if (ids.length > 0) {
      const { data: decisions } = await supabase
        .from('month_close_decisions')
        .select('decision, sobrante, monthly_summary_id')
        .in('monthly_summary_id', ids)
      if (decisions && decisions.length > 0) {
        let sum = 0
        let any = false
        for (const d of decisions as Array<{
          decision: string
          sobrante: number | string
        }>) {
          if (d.decision === 'reserva' || d.decision === 'meta') {
            sum += Number(d.sobrante ?? 0)
            any = true
          }
        }
        accumulatedSaved = any ? sum : null
      }
    }

    return {
      editionNumber,
      totalEditions,
      previous,
      accumulatedSaved,
      reserveAvailable,
    }
  } catch {
    return null
  }
}
