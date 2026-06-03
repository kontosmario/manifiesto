import { describe, expect, it } from 'vitest'
import { groupRows } from '../../mobile/features/activity-ocr/parser/group-rows'
import type { Line } from '../../mobile/features/activity-ocr/types'

const mk = (text: string, top: number, height = 40, left = 100, width = 200): Line => ({
  text,
  frame: { top, left, width, height },
})

describe('groupRows', () => {
  it('returns empty array for empty input', () => {
    expect(groupRows([])).toEqual([])
  })

  it('puts a single line into a single group', () => {
    const result = groupRows([mk('only', 100)])
    expect(result).toHaveLength(1)
    expect(result[0].lines).toHaveLength(1)
    expect(result[0].top).toBe(100)
  })

  it('groups lines that fit within gapFactor * lineHeight', () => {
    // 2 lines, 5px apart (very close), grouped.
    const result = groupRows([mk('a', 100, 40), mk('b', 145, 40)])
    expect(result).toHaveLength(1)
    expect(result[0].lines.map((l) => l.text)).toEqual(['a', 'b'])
  })

  it('splits lines that are far apart into separate groups', () => {
    // 2 lines, 200px apart (gap >> 1.8 * 40 = 72), separate.
    const result = groupRows([mk('a', 100, 40), mk('b', 340, 40)])
    expect(result).toHaveLength(2)
    expect(result[0].lines[0].text).toBe('a')
    expect(result[1].lines[0].text).toBe('b')
  })

  it('sorts lines by top before grouping', () => {
    const lines = [mk('b', 340, 40), mk('a', 100, 40)]
    const result = groupRows(lines)
    expect(result[0].lines[0].text).toBe('a')
    expect(result[1].lines[0].text).toBe('b')
  })

  it('uses a smaller group.top when later lines extend upward', () => {
    // Same group: two lines, the second physically starts higher (rare but possible).
    const result = groupRows([mk('a', 100, 40), mk('b', 90, 40)])
    expect(result).toHaveLength(1)
    expect(result[0].top).toBe(90)
  })

  it('respects a custom gapFactor', () => {
    // Same input as the split test, but gapFactor 6 keeps them together.
    const result = groupRows([mk('a', 100, 40), mk('b', 340, 40)], 6)
    expect(result).toHaveLength(1)
  })

  it('groups the brief reference layout (2 left + 2 right per row, two rows)', () => {
    const lines: Line[] = [
      mk('LA EUROPEA', 100, 60, 215, 280),
      mk('- 26.000 ARS', 105, 55, 940, 200),
      mk('01 jun 2026', 175, 45, 215, 220),
      // Big visual gap → new transaction.
      mk('USDc → ARS', 350, 60, 215, 280),
      mk('- 16 USDc', 355, 55, 940, 200),
      mk('01 jun 2026', 425, 45, 215, 220),
      mk('+ 23.697,71 ARS', 430, 50, 850, 300),
    ]
    const result = groupRows(lines)
    expect(result).toHaveLength(2)
    expect(result[0].lines.map((l) => l.text)).toContain('LA EUROPEA')
    expect(result[0].lines.map((l) => l.text)).toContain('01 jun 2026')
    expect(result[1].lines.map((l) => l.text)).toContain('USDc → ARS')
    expect(result[1].lines.map((l) => l.text)).toContain('+ 23.697,71 ARS')
  })
})
