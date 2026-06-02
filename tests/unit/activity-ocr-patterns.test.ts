import { describe, expect, it } from 'vitest'
import {
  MONTHS_ES,
  RE_AMOUNT,
  RE_DATE,
  RE_SECTION,
} from '../../mobile/features/activity-ocr/parser/patterns'

describe('RE_DATE', () => {
  it('matches "01 jun 2026"', () => {
    expect(RE_DATE.test('01 jun 2026')).toBe(true)
  })

  it('matches "1 Jun. 2026" with capitalization and trailing period', () => {
    expect(RE_DATE.test('1 Jun. 2026')).toBe(true)
  })

  it('does not match "ayer"', () => {
    expect(RE_DATE.test('ayer')).toBe(false)
  })

  it('does not match numeric "01/06/2026"', () => {
    expect(RE_DATE.test('01/06/2026')).toBe(false)
  })
})

describe('RE_AMOUNT', () => {
  it('matches "- 26.000 ARS"', () => {
    const m = '- 26.000 ARS'.match(RE_AMOUNT)
    expect(m).not.toBeNull()
    expect(m![1]).toBe('-')
    expect(m![2]).toBe('26.000')
    expect(m![3]).toBe('ARS')
  })

  it('matches "+ 23.697,71 ARS"', () => {
    const m = '+ 23.697,71 ARS'.match(RE_AMOUNT)
    expect(m).not.toBeNull()
    expect(m![1]).toBe('+')
    expect(m![2]).toBe('23.697,71')
    expect(m![3]).toBe('ARS')
  })

  it('matches Unicode minus "− 16 USDc"', () => {
    const m = '− 16 USDc'.match(RE_AMOUNT)
    expect(m).not.toBeNull()
    expect(m![1]).toBe('−')
    expect(m![3]).toBe('USDc')
  })

  it('does not match "USDc → ARS"', () => {
    expect('USDc → ARS'.match(RE_AMOUNT)).toBeNull()
  })
})

describe('RE_SECTION', () => {
  it('matches "Hoy" case-insensitive', () => {
    expect(RE_SECTION.test('Hoy')).toBe(true)
    expect(RE_SECTION.test('hoy')).toBe(true)
  })

  it('matches "Ayer"', () => {
    expect(RE_SECTION.test('Ayer')).toBe(true)
  })

  it('matches "Junio 2026"', () => {
    expect(RE_SECTION.test('Junio 2026')).toBe(true)
  })

  it('does not match "01 jun 2026"', () => {
    expect(RE_SECTION.test('01 jun 2026')).toBe(false)
  })
})

describe('MONTHS_ES', () => {
  it('maps "jun" → "06"', () => {
    expect(MONTHS_ES.jun).toBe('06')
  })

  it('covers all 12 months', () => {
    expect(Object.keys(MONTHS_ES)).toHaveLength(12)
  })
})
