/**
 * Secuencia navegable del day-detail de Gastos (las flechas ‹ ›).
 *
 * Es un tramo cronológico y contiguo:
 *   [días del ciclo hasta HOY]  ++  [días fuera-de-ciclo, si el ciclo venció]
 *
 * El último día del ciclo y el primer día fuera son consecutivos (la ventana
 * fuera arranca en `cycleEnd`, el día siguiente al último del ciclo), así que
 * › cruza de un tramo al otro y ‹ vuelve, clampando en los extremos reales.
 *
 * Vive fuera del componente por dos razones:
 *
 *  1. **Se identifica por ISO, no por día-de-mes.** En un ciclo EXTENDIDO la
 *     ventana se estira hasta hoy+1 y puede durar más de un mes (caso real:
 *     payday 5, hoy 14-ago → 5-jul..15-ago), así que el número de día se
 *     repite. Buscar el foco por número devolvía SIEMPRE la primera
 *     ocurrencia: parado en el 14 de agosto la nav creía estar en el 14 de
 *     julio, ‹ › caminaban el tramo equivocado y `canGoNext` no se apagaba
 *     nunca en el último día — el owner podía seguir avanzando más allá de hoy.
 *
 *  2. **El clamp a HOY es lo único que impide llegar a un día futuro.** En
 *     extendido `cycleEnd` es MAÑANA, así que sin el corte el último destino
 *     sería un día que todavía no pasó.
 *
 * Los dos invariantes están cubiertos por tests.
 */

/** Un destino navegable. Los dos llevan ISO; `day` es sólo para pintar la
 *  celda seleccionada del calendario, que el controller indexa por número. */
export type DayFocusTarget =
  | { kind: 'cycle'; iso: string; day: number }
  | { kind: 'out'; iso: string }

/** `YYYY-MM-DD` LOCAL. Nunca `toISOString()`, que corre el día ±1 según tz. */
export function localIsoKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function buildDayFocusTargets(input: {
  /** Días del ciclo, normalizados a medianoche local. */
  cycleDates: Date[]
  /** Medianoche local de HOY, en ms. */
  todayStartMs: number
  /** Días de la ventana fuera-de-ciclo (vacía si el ciclo no venció). */
  outDays: { iso: string }[]
  isOverdue: boolean
}): DayFocusTarget[] {
  const { cycleDates, todayStartMs, outDays, isOverdue } = input
  const targets: DayFocusTarget[] = []
  for (const d of cycleDates) {
    if (d.getTime() <= todayStartMs) {
      targets.push({ kind: 'cycle', iso: localIsoKey(d), day: d.getDate() })
    }
  }
  if (isOverdue) {
    for (const od of outDays) targets.push({ kind: 'out', iso: od.iso })
  }
  return targets
}

/** Índice del foco actual. -1 = sin día en foco (calendario a la vista). */
export function findDayFocusIndex(
  targets: DayFocusTarget[],
  focus: { selectedDayIso: string | null; selectedOutIso: string | null },
): number {
  if (focus.selectedOutIso != null) {
    return targets.findIndex((t) => t.kind === 'out' && t.iso === focus.selectedOutIso)
  }
  if (focus.selectedDayIso != null) {
    return targets.findIndex((t) => t.kind === 'cycle' && t.iso === focus.selectedDayIso)
  }
  return -1
}

/** Habilitación de las flechas. Fuera de la secuencia (-1) no hay nav. */
export function dayFocusNavBounds(
  index: number,
  length: number,
): { canGoPrev: boolean; canGoNext: boolean } {
  return {
    canGoPrev: index > 0,
    canGoNext: index >= 0 && index < length - 1,
  }
}
