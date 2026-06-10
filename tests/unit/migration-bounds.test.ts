// Sprint L · Audit #5 L-Med4 (2026-06-13) — CI guard for hardcoded
// migration constraint bounds.
//
// Background:
//   `20260613003100_sprint_k_anchor_check_absolute.sql` introduces a
//   CHECK constraint on `family_finance.current_cycle_anchor` with an
//   ABSOLUTE upper bound of `2030-01-01`. Absolute is the right call
//   (see that migration's comment block — IMMUTABLE-safe for
//   pg_dump+restore) but absolute bounds quietly rot: as 2030
//   approaches, valid month-close anchors start failing the CHECK.
//
//   The migration's only mitigation was a SQL comment saying "bump
//   this bound during yearly maintenance" — operationally that means
//   "hope someone reads it before things break."
//
// This test:
//   Fails CI 12 months BEFORE any monitored bound, forcing whoever
//   touches the repo at that point to ship a maintenance migration
//   that pushes the bound out. The horizon (12 months) gives plenty
//   of time to land + deploy + verify the new bound without a fire
//   drill.
//
// When this test fails:
//   1. Add a new migration that drops + re-adds the named CHECK
//      constraint with a fresh upper bound (e.g. +5 years).
//   2. Bump the date constant below to match. Re-run the test.
//   3. Audit any OTHER hardcoded date bounds in migrations and bump
//      them alongside.
//
// If a new constraint with a hardcoded date bound is added, register
// it in the BOUNDS table below so it's monitored from the start.

import { describe, expect, it } from 'vitest'

interface MonitoredBound {
  /** Human-readable label for the failure message. */
  label: string
  /** Migration file the bound lives in (for traceability). */
  migrationFile: string
  /** The upper bound date itself, ISO. */
  upperBoundIso: string
}

const BOUNDS: ReadonlyArray<MonitoredBound> = [
  {
    label: 'family_finance.current_cycle_anchor CHECK upper bound',
    migrationFile:
      '20260613003100_sprint_k_anchor_check_absolute.sql',
    upperBoundIso: '2030-01-01',
  },
]

// Warn 12 months ahead — enough lead time to land a maintenance
// migration through review + deploy without rushing.
const WARNING_HORIZON_MONTHS = 12
const APPROX_DAYS_PER_MONTH = 30

describe('Migration constraint bounds (Sprint L · L-Med4)', () => {
  for (const bound of BOUNDS) {
    it(`${bound.label} is >${WARNING_HORIZON_MONTHS} months out`, () => {
      const upper = new Date(bound.upperBoundIso)
      expect(Number.isFinite(upper.getTime())).toBe(true)

      const now = new Date()
      const msUntil = upper.getTime() - now.getTime()
      const monthsUntil =
        msUntil / (1000 * 60 * 60 * 24 * APPROX_DAYS_PER_MONTH)

      // When this fires, ship a maintenance migration that bumps the
      // bound. See the top-of-file comment for the procedure.
      expect(
        monthsUntil,
        `Migration constraint bound ${bound.label} (set in ${bound.migrationFile}, currently ${bound.upperBoundIso}) is within ${WARNING_HORIZON_MONTHS} months. Ship a maintenance migration that pushes the bound out, then bump the constant in tests/unit/migration-bounds.test.ts to match.`,
      ).toBeGreaterThan(WARNING_HORIZON_MONTHS)
    })
  }
})
