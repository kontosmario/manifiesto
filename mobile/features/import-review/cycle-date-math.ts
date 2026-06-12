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
 */
export function buildCycleDays(
  cycleStart: Date,
  cycleDays: number,
  todayISO: string,
): CycleDay[] {
  if (cycleDays <= 0) return []
  const out: CycleDay[] = []
  for (let i = 0; i < cycleDays; i++) {
    const d = new Date(
      cycleStart.getFullYear(),
      cycleStart.getMonth(),
      cycleStart.getDate() + i,
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
