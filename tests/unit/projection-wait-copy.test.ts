import { describe, expect, it } from 'vitest'
import { formatProjectionWaitCopy } from '@/components/home/projection-wait-copy'

describe('formatProjectionWaitCopy', () => {
  it('returns plural copy when 2+ days remain to a reliable projection', () => {
    expect(formatProjectionWaitCopy(2)).toEqual({
      label: 'Aún calculando',
      detail: '2 días',
    })
  })

  it('returns singular copy when only 1 day remains', () => {
    expect(formatProjectionWaitCopy(1)).toEqual({
      label: 'Aún calculando',
      detail: '1 día',
    })
  })

  it('clamps non-positive inputs to a 1-day fallback (never says "0 días")', () => {
    expect(formatProjectionWaitCopy(0)).toEqual({
      label: 'Aún calculando',
      detail: '1 día',
    })
    expect(formatProjectionWaitCopy(-3)).toEqual({
      label: 'Aún calculando',
      detail: '1 día',
    })
  })

  it('does not pretend to know more than it does — copy must explain the wait, not just count down', () => {
    const copy = formatProjectionWaitCopy(2)
    expect(copy.label.toLowerCase()).toMatch(/calculando|esperando/)
  })

  it('keeps the joined string short enough to fit on one line of the hero tile', () => {
    // Sub text width inside the hero tile is ~152px on a 393px-wide
    // device after row gaps + padding. At fontSize 11 that's roughly
    // 22-25 chars per line — accented glyphs (ú, í) and the middle
    // dot are narrow, so the ceiling is generous. Anything past this
    // wraps and breaks the "tiles share height" promise even with
    // flex/minHeight tricks. Range 1..3 covers every realistic input
    // (consumer feeds `4 - data.cycleDay`, `projectionReliable` flips
    // true at cycleDay >= 4).
    for (const days of [1, 2, 3]) {
      const copy = formatProjectionWaitCopy(days)
      const joined = `${copy.label} · ${copy.detail}`
      expect(joined.length).toBeLessThanOrEqual(24)
    }
  })
})
