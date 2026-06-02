import { describe, expect, it } from 'vitest'
import { parseActivityLines } from '../../mobile/features/activity-ocr/parse-activity-lines'
import type { Line } from '../../mobile/features/activity-ocr/types'

const IMAGE_WIDTH = 1206

const mk = (text: string, top: number, left: number, width: number, height: number): Line => ({
  text,
  frame: { top, left, width, height },
})

describe('parseActivityLines — empty / invalid input', () => {
  it('returns empty result for empty lines', () => {
    expect(parseActivityLines([], IMAGE_WIDTH)).toEqual({ transactions: [], unmatched: [] })
  })

  it('returns empty result for non-positive imageWidth without throwing', () => {
    const lines: Line[] = [mk('LA EUROPEA', 100, 215, 280, 60)]
    expect(parseActivityLines(lines, 0)).toEqual({ transactions: [], unmatched: [] })
    expect(parseActivityLines(lines, -5)).toEqual({ transactions: [], unmatched: [] })
  })
})

describe('parseActivityLines — reference capture (4 transactions)', () => {
  it('produces the 4 transactions from the brief reference screenshot', () => {
    const lines: Line[] = [
      // tx 1: LA EUROPEA
      mk('LA EUROPEA', 100, 215, 280, 60),
      mk('01 jun 2026', 175, 215, 220, 45),
      mk('- 26.000 ARS', 105, 940, 200, 55),
      // tx 2: USDc → ARS swap
      mk('USDc → ARS', 350, 215, 280, 60),
      mk('01 jun 2026', 425, 215, 220, 45),
      mk('- 16 USDc', 355, 940, 200, 55),
      mk('+ 23.697,71 ARS', 430, 850, 300, 50),
      // tx 3: Cashback
      mk('Cashback', 600, 215, 200, 60),
      mk('01 jun 2026', 675, 215, 220, 45),
      mk('+ 15,49 USDc', 605, 940, 220, 55),
      // tx 4: A RASCHI SANTIAGO
      mk('A RASCHI SANTIAGO', 850, 215, 320, 60),
      mk('01 jun 2026', 925, 215, 220, 45),
      mk('- 110.000 ARS', 855, 940, 220, 55),
    ]

    const result = parseActivityLines(lines, IMAGE_WIDTH)
    expect(result.unmatched).toEqual([])
    expect(result.transactions).toHaveLength(4)

    expect(result.transactions[0]).toMatchObject({
      merchant: 'LA EUROPEA',
      date: '2026-06-01',
      section: null,
      primaryAmount: { value: 26000, currency: 'ARS', sign: -1 },
      secondaryAmount: null,
    })

    expect(result.transactions[1]).toMatchObject({
      merchant: 'USDc → ARS',
      date: '2026-06-01',
      section: null,
      primaryAmount: { value: 16, currency: 'USDc', sign: -1 },
      secondaryAmount: { value: 23697.71, currency: 'ARS', sign: 1 },
    })

    expect(result.transactions[2]).toMatchObject({
      merchant: 'Cashback',
      date: '2026-06-01',
      primaryAmount: { value: 15.49, currency: 'USDc', sign: 1 },
    })

    expect(result.transactions[3]).toMatchObject({
      merchant: 'A RASCHI SANTIAGO',
      date: '2026-06-01',
      primaryAmount: { value: 110000, currency: 'ARS', sign: -1 },
    })
  })
})

describe('parseActivityLines — section inheritance', () => {
  it('inherits a section header into following transactions', () => {
    const lines: Line[] = [
      mk('Hoy', 40, 100, 100, 40),
      // tx under "Hoy"
      mk('LA EUROPEA', 200, 215, 280, 60),
      mk('01 jun 2026', 275, 215, 220, 45),
      mk('- 26.000 ARS', 205, 940, 200, 55),
    ]
    const result = parseActivityLines(lines, IMAGE_WIDTH)
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0].section).toBe('Hoy')
  })

  it('switches section when a new header appears mid-list', () => {
    const lines: Line[] = [
      mk('Hoy', 40, 100, 100, 40),
      // tx 1 under Hoy
      mk('A', 200, 215, 100, 60),
      mk('01 jun 2026', 275, 215, 220, 45),
      mk('- 10 ARS', 205, 940, 200, 55),
      // new section
      mk('Ayer', 500, 100, 100, 40),
      // tx 2 under Ayer
      mk('B', 700, 215, 100, 60),
      mk('31 may 2026', 775, 215, 220, 45),
      mk('- 20 ARS', 705, 940, 200, 55),
    ]
    const result = parseActivityLines(lines, IMAGE_WIDTH)
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0].section).toBe('Hoy')
    expect(result.transactions[1].section).toBe('Ayer')
  })

  it('extracts a section header bundled into a transaction group (merged by small gap)', () => {
    // Regression: en device real (2026-06-02 captura kontosmario) ML Kit
    // dejó "Hoy" en el mismo grupo Y que la primera transacción porque
    // el gap entre header y fila era < gapFactor*height. Resultado
    // anterior: merchant: "Hoy", section: null. Esperado tras fix:
    // merchant: "MERPAGO*MRPROVO", section: "Hoy".
    const lines: Line[] = [
      mk('Hoy', 100, 100, 80, 30), // header
      mk('MERPAGO*MRPROVO', 130, 215, 280, 60), // gap = 0 → merged
      mk('02 jun 2026', 195, 215, 220, 45),
      mk('- 55.984,50 ARS', 135, 940, 200, 55),
    ]
    const result = parseActivityLines(lines, IMAGE_WIDTH)
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0].merchant).toBe('MERPAGO*MRPROVO')
    expect(result.transactions[0].section).toBe('Hoy')
    expect(result.transactions[0].primaryAmount.value).toBe(55984.5)
    expect(result.unmatched).toEqual([])
  })
})

describe('parseActivityLines — unmatched', () => {
  it('routes groups without a parseable amount into unmatched', () => {
    const lines: Line[] = [
      // No amount on the right → unmatched (not a section header either).
      mk('something weird', 100, 215, 280, 60),
      mk('01 jun 2026', 175, 215, 220, 45),
    ]
    const result = parseActivityLines(lines, IMAGE_WIDTH)
    expect(result.transactions).toEqual([])
    expect(result.unmatched).toHaveLength(1)
  })
})
