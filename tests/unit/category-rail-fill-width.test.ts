import { describe, expect, it } from 'vitest'
import { computeFillTileWidth } from '@/components/home/category-rail-fill-width'

describe('computeFillTileWidth', () => {
  it('returns the default width when only one category is shown (no point stretching to absurd sizes)', () => {
    const w = computeFillTileWidth({
      categoriesCount: 1,
      rows: 3,
      screenWidth: 393,
      gap: 8,
      sidePadding: 8,
      defaultTileWidth: 60,
      maxTileWidth: 110,
    })
    // 1 cat / 3 rows = 1 column. Stretching to fill screen would be
    // ~377pt — capped at maxTileWidth.
    expect(w).toBe(110)
  })

  it('expands tiles to fill the viewport when 12 categories fit without scrolling', () => {
    // 12 / 3 rows = 4 columns. Available = 393 - 8*2 = 377. 4 tiles + 3
    // gaps of 8 = 24 → 353 / 4 = 88.25 → floor = 88.
    const w = computeFillTileWidth({
      categoriesCount: 12,
      rows: 3,
      screenWidth: 393,
      gap: 8,
      sidePadding: 8,
      defaultTileWidth: 60,
      maxTileWidth: 110,
    })
    expect(w).toBe(88)
  })

  it('falls back to the default when content overflows the viewport (let the rail scroll)', () => {
    // 24 / 3 rows = 8 columns. 8 * 60 + 7 * 8 = 536 > 377 available →
    // fall back to default so the user can scroll.
    const w = computeFillTileWidth({
      categoriesCount: 24,
      rows: 3,
      screenWidth: 393,
      gap: 8,
      sidePadding: 8,
      defaultTileWidth: 60,
      maxTileWidth: 110,
    })
    expect(w).toBe(60)
  })

  it('never returns a tile narrower than the default (don\'t shrink past readable size)', () => {
    // 18 / 3 = 6 cols. 6 * 60 + 5 * 8 = 400 > 377 → would compute
    // (377 - 40) / 6 = 56.17 = 56 (floor) — narrower than default.
    // Helper must clamp UP to default in that case.
    const w = computeFillTileWidth({
      categoriesCount: 18,
      rows: 3,
      screenWidth: 393,
      gap: 8,
      sidePadding: 8,
      defaultTileWidth: 60,
      maxTileWidth: 110,
    })
    expect(w).toBe(60)
  })

  it('handles a wider iPad-like viewport gracefully (capped at max)', () => {
    const w = computeFillTileWidth({
      categoriesCount: 12,
      rows: 3,
      screenWidth: 1024,
      gap: 8,
      sidePadding: 8,
      defaultTileWidth: 60,
      maxTileWidth: 110,
    })
    // 4 cols. (1024 - 16 - 24) / 4 = 246 → capped at 110.
    expect(w).toBe(110)
  })

  it('rounds down to keep tiles inside the viewport (never overflow)', () => {
    const w = computeFillTileWidth({
      categoriesCount: 9,
      rows: 3,
      screenWidth: 375,
      gap: 8,
      sidePadding: 8,
      defaultTileWidth: 60,
      maxTileWidth: 110,
    })
    // 3 cols. (375 - 16 - 16) / 3 = 114.33 → capped at 110.
    expect(w).toBe(110)
  })
})
