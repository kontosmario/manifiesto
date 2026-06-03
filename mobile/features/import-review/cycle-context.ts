import { useMemo } from 'react'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'

export interface CycleInfo {
  /** First date of the current pay cycle, midnight LOCAL. */
  cycleStart: Date
  /** Total days in the cycle window (typically 28-31). */
  cycleDays: number
}

/**
 * Computes a CycleInfo from explicit ISO bounds. Returns null if
 * either bound is missing or invalid (caller should fall back).
 */
export function computeCycleFromBounds(
  startISO: string | null | undefined,
  endISO: string | null | undefined,
): CycleInfo | null {
  if (!startISO || !endISO) return null
  const start = parseLocalDate(startISO)
  const end = parseLocalDate(endISO)
  if (!start || !end) return null
  if (end.getTime() < start.getTime()) return null
  const msPerDay = 1000 * 60 * 60 * 24
  const days = Math.round((end.getTime() - start.getTime()) / msPerDay) + 1
  return { cycleStart: start, cycleDays: days }
}

/**
 * Heuristic fallback used while the snapshot is loading: returns the
 * full current month as a 31-day cycle. Imperfect but lets the slider
 * render something instead of an empty strip.
 */
export function computeFallbackCycle(today: Date): CycleInfo {
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  return { cycleStart: start, cycleDays: 31 }
}

/**
 * Resolves the current cycle from `useHomeSnapshot`. Falls back to a
 * full-month heuristic while loading.
 */
export function useCycleInfo(userId: string | undefined): CycleInfo {
  const snapshot = useHomeSnapshot(userId)
  return useMemo(() => {
    const bounded = computeCycleFromBounds(
      snapshot.data?.payments_cycle_start,
      snapshot.data?.payments_cycle_end,
    )
    if (bounded) return bounded
    return computeFallbackCycle(new Date())
  }, [
    snapshot.data?.payments_cycle_start,
    snapshot.data?.payments_cycle_end,
  ])
}

function parseLocalDate(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2]) - 1
  const day = Number(m[3])
  const d = new Date(year, month, day)
  return Number.isFinite(d.getTime()) ? d : null
}
