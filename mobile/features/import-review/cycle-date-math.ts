export interface CycleDay {
  /** YYYY-MM-DD local ISO. */
  iso: string
  /** Day of month (1-31). */
  day: number
  /** 0 = Sunday, 1 = Monday, ..., 6 = Saturday. Same as Date.getDay(). */
  weekday: number
  /** True iff this day matches `todayISO`. */
  isToday: boolean
}

/** Format a local Date to YYYY-MM-DD (local TZ). */
export function formatISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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
    })
  }
  return out
}
