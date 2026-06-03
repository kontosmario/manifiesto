import { describe, expect, it } from 'vitest'
import { normalize } from '../../mobile/features/activity-ocr/parser/normalize'

describe('normalize', () => {
  it('flattens block.lines and reads flat frame shape', () => {
    const blocks = [
      {
        lines: [
          { text: 'LA EUROPEA', frame: { top: 100, left: 215, width: 280, height: 60 } },
          { text: '01 jun 2026', frame: { top: 175, left: 215, width: 220, height: 45 } },
        ],
      },
    ]
    const result = normalize(blocks)
    expect(result).toEqual([
      { text: 'LA EUROPEA', frame: { top: 100, left: 215, width: 280, height: 60 } },
      { text: '01 jun 2026', frame: { top: 175, left: 215, width: 220, height: 45 } },
    ])
  })

  it('reads nested boundingBox frame shape', () => {
    const blocks = [
      {
        lines: [
          {
            text: 'LA EUROPEA',
            frame: { boundingBox: { top: 100, left: 215, width: 280, height: 60 } },
          },
        ],
      },
    ]
    const result = normalize(blocks)
    expect(result).toEqual([
      { text: 'LA EUROPEA', frame: { top: 100, left: 215, width: 280, height: 60 } },
    ])
  })

  it('trims whitespace from text', () => {
    const blocks = [
      {
        lines: [
          { text: '  LA EUROPEA  ', frame: { top: 100, left: 215, width: 280, height: 60 } },
        ],
      },
    ]
    const result = normalize(blocks)
    expect(result[0].text).toBe('LA EUROPEA')
  })

  it('skips blocks without a lines array', () => {
    const blocks = [
      { text: 'ignored', frame: { top: 0, left: 0, width: 10, height: 10 } },
      {
        lines: [
          { text: 'kept', frame: { top: 0, left: 0, width: 10, height: 10 } },
        ],
      },
    ]
    const result = normalize(blocks)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('kept')
  })

  it('skips lines with empty text', () => {
    const blocks = [
      {
        lines: [
          { text: '', frame: { top: 0, left: 0, width: 10, height: 10 } },
          { text: '   ', frame: { top: 0, left: 0, width: 10, height: 10 } },
          { text: 'kept', frame: { top: 0, left: 0, width: 10, height: 10 } },
        ],
      },
    ]
    const result = normalize(blocks)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('kept')
  })

  it('skips lines with degenerate frame (width or height 0)', () => {
    const blocks = [
      {
        lines: [
          { text: 'zero-width', frame: { top: 0, left: 0, width: 0, height: 10 } },
          { text: 'zero-height', frame: { top: 0, left: 0, width: 10, height: 0 } },
          { text: 'kept', frame: { top: 0, left: 0, width: 10, height: 10 } },
        ],
      },
    ]
    const result = normalize(blocks)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('kept')
  })

  it('returns empty array for empty input', () => {
    expect(normalize([])).toEqual([])
  })
})
