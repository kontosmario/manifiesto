/**
 * Shared time constants and helpers. Moved here from feature modules
 * after the 2026-05-31 code review found DAY_MS duplicated 4× and
 * inline `(1000 * 60 * 60 * 24)` magic numbers in 5+ more spots.
 */

export const DAY_MS = 1000 * 60 * 60 * 24
export const HOUR_MS = 1000 * 60 * 60
export const MINUTE_MS = 1000 * 60

/**
 * Whole days between two timestamps (or Date objects). Rounds down
 * by default (consistent with `Math.floor((a - b) / DAY_MS)`). Pass
 * `'round'` to round to nearest day for "≈ N days" UI copy.
 */
export function daysBetween(
  a: Date | number,
  b: Date | number,
  mode: 'floor' | 'round' = 'floor',
): number {
  const aMs = typeof a === 'number' ? a : a.getTime()
  const bMs = typeof b === 'number' ? b : b.getTime()
  const diff = (aMs - bMs) / DAY_MS
  return mode === 'round' ? Math.round(diff) : Math.floor(diff)
}
