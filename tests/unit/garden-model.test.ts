import { describe, expect, it } from 'vitest'
import {
  broteStageForDay,
  fernSizeForAge,
  deriveGardenCells,
  deriveWeekClose,
} from '@/features/garden/garden-model'

describe('broteStageForDay', () => {
  it('pre-tracking days are "pre" regardless of logged', () => {
    expect(broteStageForDay(40, false, true)).toBe('pre')
    expect(broteStageForDay(40, true, true)).toBe('pre')
  })
  it('today not logged is "pending"', () => {
    expect(broteStageForDay(0, false, false)).toBe('pending')
  })
  it('unlogged in-window day is "missed" (no marchita)', () => {
    expect(broteStageForDay(5, false, false)).toBe('missed')
  })
  it('logged day matures with age: seed <=6, germ 7..13, fern >=14', () => {
    expect(broteStageForDay(0, true, false)).toBe('seed')
    expect(broteStageForDay(6, true, false)).toBe('seed')
    expect(broteStageForDay(7, true, false)).toBe('germ')
    expect(broteStageForDay(13, true, false)).toBe('germ')
    expect(broteStageForDay(14, true, false)).toBe('fern')
  })
})

describe('fernSizeForAge', () => {
  it('grows from 24 to 32 and caps', () => {
    expect(fernSizeForAge(14)).toBe(24)
    expect(fernSizeForAge(30)).toBe(32)
    expect(fernSizeForAge(60)).toBe(32)
  })
})

describe('deriveGardenCells', () => {
  const todayIso = '2026-06-22'
  // offset 0 = today, offset 34 = oldest
  const dayIsoAtOffset = (offset: number) => {
    const d = new Date(Date.UTC(2026, 5, 22) - offset * 86_400_000)
    return d.toISOString().slice(0, 10)
  }
  it('returns 35 cells, index34 = today', () => {
    const cells = deriveGardenCells(new Set(['2026-06-22']), todayIso, dayIsoAtOffset, '2026-06-01')
    expect(cells).toHaveLength(35)
    expect(cells[34].isToday).toBe(true)
    expect(cells[34].iso).toBe('2026-06-22')
  })
  it('today logged = seed, today unlogged = pending', () => {
    const logged = deriveGardenCells(new Set(['2026-06-22']), todayIso, dayIsoAtOffset, '2026-06-22')
    expect(logged[34].stage).toBe('seed')
    const empty = deriveGardenCells(new Set(), todayIso, dayIsoAtOffset, null)
    expect(empty[34].stage).toBe('pending')
  })
  it('days before firstActivity are pre-tracking, gaps inside are missed', () => {
    const cells = deriveGardenCells(
      new Set(['2026-06-20', '2026-06-22']),
      todayIso,
      dayIsoAtOffset,
      '2026-06-20',
    )
    // 2026-06-21 (age1) is inside tracking, unlogged → missed
    const d21 = cells.find((c) => c.iso === '2026-06-21')!
    expect(d21.stage).toBe('missed')
    // 2026-06-19 is before first activity → pre
    const d19 = cells.find((c) => c.iso === '2026-06-19')!
    expect(d19.stage).toBe('pre')
  })
})

describe('deriveWeekClose', () => {
  // Monday..Sunday of a reference week
  const weekDayIso = (i: number) =>
    new Date(Date.UTC(2026, 5, 16) + i * 86_400_000).toISOString().slice(0, 10)
  it('score 7 = perfect week, fern + bloom', () => {
    const all = new Set(Array.from({ length: 7 }, (_, i) => weekDayIso(i)))
    const wc = deriveWeekClose(all, weekDayIso)
    expect(wc.score).toBe(7)
    expect(wc.stage).toBe('fern')
    expect(wc.bloom).toBe(true)
    expect(wc.label).toBe('Semana perfecta')
  })
  it('score thresholds map to stages', () => {
    const mk = (n: number) => new Set(Array.from({ length: n }, (_, i) => weekDayIso(i)))
    expect(deriveWeekClose(mk(6), weekDayIso).stage).toBe('fern')
    expect(deriveWeekClose(mk(4), weekDayIso).stage).toBe('germ')
    expect(deriveWeekClose(mk(2), weekDayIso).stage).toBe('seed')
    expect(deriveWeekClose(mk(0), weekDayIso).stage).toBe('none')
  })
})
