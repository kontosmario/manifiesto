export interface CycleDay {
  /** YYYY-MM-DD local ISO. */
  iso: string
  /** Day of month (1-31). */
  day: number
  /** 0 = Sunday, 1 = Monday, ..., 6 = Saturday. Same as Date.getDay(). */
  weekday: number
  /** True iff this day matches `todayISO`. */
  isToday: boolean
  /** True iff this day is AFTER `todayISO`. Un gasto no puede ser
   *  futuro — el slider deshabilita estos tiles. */
  isFuture: boolean
}

/** Format a local Date to YYYY-MM-DD (local TZ). */
export function formatISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Converts a `YYYY-MM-DD` string into a full ISO timestamp anchored at
 * noon local time. Used when handing the row's date off to APIs that
 * write into a `timestamptz` column: passing the raw `YYYY-MM-DD`
 * makes Postgres interpret it as UTC midnight, which shifts back to
 * the previous day in any UI that renders the timestamp in AR-local
 * time (UTC-3). Noon avoids both the cross-day boundary AND DST edge
 * cases. Same pattern as the back-dated "gasto olvidado" flow.
 *
 * Returns `undefined` for malformed input so callers can fall back to
 * the DB's `now()` default instead of inserting garbage.
 */
export function isoDateToLocalNoonTimestamp(iso: string): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return undefined
  const [, y, mo, d] = m
  return new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    12,
    0,
    0,
    0,
  ).toISOString()
}

/**
 * Builds a flat list of CycleDay entries covering [cycleStart, cycleStart + cycleDays).
 * Used by CycleDateSlider to render the horizontal strip of selectable days.
 *
 * `includeISO` ENSANCHA la ventana hacia atrás para que la fecha de la fila
 * siempre tenga su tile. Sin eso, una captura vieja —o un pago de Apple Pay
 * de un ciclo anterior— caía fuera del riel: ningún día quedaba seleccionado
 * y el usuario no tenía forma de cambiar la fecha desde la UI. Sólo se
 * extiende hacia ATRÁS: un gasto futuro no existe y ya está anclado a hoy
 * por el mapeo, así que una fecha posterior al ciclo se ignora.
 */
export function buildCycleDays(
  cycleStart: Date,
  cycleDays: number,
  todayISO: string,
  includeISO?: string | null,
): CycleDay[] {
  if (cycleDays <= 0) return []

  let start = cycleStart
  let total = cycleDays
  const startISO = formatISO(cycleStart)
  // Comparación lexicográfica válida para YYYY-MM-DD.
  if (includeISO && /^\d{4}-\d{2}-\d{2}$/.test(includeISO) && includeISO < startISO) {
    const [y, m, d] = includeISO.split('-').map(Number)
    const target = new Date(y, m - 1, d)
    const extraDays = Math.round(
      (new Date(cycleStart.getFullYear(), cycleStart.getMonth(), cycleStart.getDate()).getTime() -
        target.getTime()) /
        86_400_000,
    )
    if (extraDays > 0) {
      start = target
      total = cycleDays + extraDays
    }
  }

  const out: CycleDay[] = []
  for (let i = 0; i < total; i++) {
    const d = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + i,
    )
    const iso = formatISO(d)
    out.push({
      iso,
      day: d.getDate(),
      weekday: d.getDay(),
      isToday: iso === todayISO,
      // Comparación lexicográfica válida para YYYY-MM-DD.
      isFuture: iso > todayISO,
    })
  }
  return out
}
