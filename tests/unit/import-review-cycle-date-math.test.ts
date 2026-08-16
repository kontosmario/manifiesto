import { describe, expect, it } from 'vitest'
import {
  buildCycleDays,
  formatISO,
  isoDateToLocalNoonTimestamp,
} from '../../mobile/features/import-review/cycle-date-math'

describe('formatISO', () => {
  it('formats a Date to YYYY-MM-DD in local time', () => {
    // Construct date in local time
    const d = new Date(2026, 5, 2) // June 2, 2026 local
    expect(formatISO(d)).toBe('2026-06-02')
  })

  it('pads single-digit month and day', () => {
    const d = new Date(2026, 0, 5) // Jan 5, 2026
    expect(formatISO(d)).toBe('2026-01-05')
  })
})

describe('buildCycleDays', () => {
  // Bug: una captura vieja (o un pago de Apple Pay de un ciclo anterior)
  // caía fuera de la ventana: ningún día quedaba seleccionado y no había
  // forma de cambiar la fecha desde la UI.
  it('extiende la ventana hacia atrás para incluir una fecha anterior al ciclo', () => {
    const start = new Date(2026, 4, 10) // 10 may 2026
    const result = buildCycleDays(start, 10, '2026-05-15', '2026-05-06')
    expect(result[0].iso).toBe('2026-05-06')
    expect(result.at(-1)?.iso).toBe('2026-05-19')
    expect(result.map((d) => d.iso)).toContain('2026-05-06')
    // Sin huecos: 4 días extra + los 10 del ciclo.
    expect(result).toHaveLength(14)
  })

  it('no toca la ventana cuando la fecha ya cae adentro', () => {
    const start = new Date(2026, 4, 10)
    const inside = buildCycleDays(start, 10, '2026-05-15', '2026-05-12')
    const plain = buildCycleDays(start, 10, '2026-05-15')
    expect(inside).toEqual(plain)
  })

  it('ignora una fecha posterior al ciclo (un gasto futuro no existe)', () => {
    const start = new Date(2026, 4, 10)
    const after = buildCycleDays(start, 10, '2026-05-15', '2026-06-30')
    expect(after).toEqual(buildCycleDays(start, 10, '2026-05-15'))
  })

  it('returns one entry per day across a 31-day cycle', () => {
    const start = new Date(2026, 4, 1) // May 1, 2026 local
    const result = buildCycleDays(start, 31, '2026-05-15')
    expect(result).toHaveLength(31)
    expect(result[0]).toEqual({
      iso: '2026-05-01',
      day: 1,
      weekday: new Date(2026, 4, 1).getDay(),
      isToday: false,
      isFuture: false,
    })
    expect(result[30]).toMatchObject({
      iso: '2026-05-31',
      day: 31,
    })
  })

  it('marks isToday only for the entry matching todayISO', () => {
    const start = new Date(2026, 4, 1)
    const result = buildCycleDays(start, 31, '2026-05-15')
    const todays = result.filter((d) => d.isToday)
    expect(todays).toHaveLength(1)
    expect(todays[0].iso).toBe('2026-05-15')
  })

  it('marks isFuture for days strictly after today (un gasto no es futuro)', () => {
    const start = new Date(2026, 4, 1) // May 1
    const result = buildCycleDays(start, 31, '2026-05-15')
    // Hoy y días previos: no futuros.
    expect(result.find((d) => d.iso === '2026-05-15')?.isFuture).toBe(false)
    expect(result.find((d) => d.iso === '2026-05-14')?.isFuture).toBe(false)
    expect(result.find((d) => d.iso === '2026-05-01')?.isFuture).toBe(false)
    // Días posteriores: futuros, no seleccionables.
    expect(result.find((d) => d.iso === '2026-05-16')?.isFuture).toBe(true)
    expect(result.find((d) => d.iso === '2026-05-31')?.isFuture).toBe(true)
    expect(result.filter((d) => d.isFuture)).toHaveLength(16) // 16..31
  })

  it('handles a cycle that spans two months', () => {
    const start = new Date(2026, 4, 20) // May 20
    const result = buildCycleDays(start, 31, '2026-06-02')
    expect(result[0].iso).toBe('2026-05-20')
    expect(result[11].iso).toBe('2026-05-31')
    expect(result[12].iso).toBe('2026-06-01')
    expect(result[30].iso).toBe('2026-06-19')
  })

  it('returns empty array if cycleDays is 0 or negative', () => {
    const start = new Date(2026, 4, 1)
    expect(buildCycleDays(start, 0, '2026-05-15')).toEqual([])
    expect(buildCycleDays(start, -3, '2026-05-15')).toEqual([])
  })

  it('weekday matches Date.getDay() (0=Sunday, 1=Monday, ..., 6=Saturday)', () => {
    // Pick a known Monday: June 1, 2026 is a Monday
    const start = new Date(2026, 5, 1)
    const result = buildCycleDays(start, 7, '2026-06-01')
    expect(result[0].weekday).toBe(1) // Monday
    expect(result[6].weekday).toBe(0) // Sunday
  })
})

describe('isoDateToLocalNoonTimestamp', () => {
  it('round-trips through local-time formatting back to the same day', () => {
    // Regression for the off-by-one bug: passing "2026-06-02" raw to a
    // timestamptz column was being read as UTC midnight (= June 1 21:00
    // in AR), making the expense show under the previous day. Anchoring
    // at noon local guarantees the local-day reading matches the input
    // regardless of which AR-friendly timezone the test host uses.
    const result = isoDateToLocalNoonTimestamp('2026-06-02')
    expect(result).toBeDefined()
    const parsed = new Date(result as string)
    // Same local-day as the input ISO.
    expect(formatISO(parsed)).toBe('2026-06-02')
    // Noon (12:00) keeps us safely away from both midnight boundaries.
    expect(parsed.getHours()).toBe(12)
  })

  it('returns undefined for malformed input so the DB default kicks in', () => {
    expect(isoDateToLocalNoonTimestamp('')).toBeUndefined()
    expect(isoDateToLocalNoonTimestamp('not-a-date')).toBeUndefined()
    expect(isoDateToLocalNoonTimestamp('2026-6-2')).toBeUndefined()
    expect(isoDateToLocalNoonTimestamp('2026/06/02')).toBeUndefined()
  })

  it('handles month/day boundaries without rolling over', () => {
    const last = isoDateToLocalNoonTimestamp('2026-12-31')
    expect(formatISO(new Date(last as string))).toBe('2026-12-31')
    const first = isoDateToLocalNoonTimestamp('2026-01-01')
    expect(formatISO(new Date(first as string))).toBe('2026-01-01')
  })
})
