import { describe, expect, it } from 'vitest'
import {
  MONTHS_ES,
  RE_AMOUNT,
  RE_DATE,
  RE_SECTION,
  sectionToISODate,
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
  // Groups: m[1]=sign, m[2]=`$` or undef, m[3]=number, m[4]=currency code or undef.

  it('matches "- 26.000 ARS" (currency code form)', () => {
    const m = '- 26.000 ARS'.match(RE_AMOUNT)
    expect(m).not.toBeNull()
    expect(m![1]).toBe('-')
    expect(m![2]).toBeUndefined()
    expect(m![3]).toBe('26.000')
    expect(m![4]).toBe('ARS')
  })

  it('matches "+ 23.697,71 ARS"', () => {
    const m = '+ 23.697,71 ARS'.match(RE_AMOUNT)
    expect(m).not.toBeNull()
    expect(m![1]).toBe('+')
    expect(m![3]).toBe('23.697,71')
    expect(m![4]).toBe('ARS')
  })

  it('matches Unicode minus "− 16 USDc"', () => {
    const m = '− 16 USDc'.match(RE_AMOUNT)
    expect(m).not.toBeNull()
    expect(m![1]).toBe('−')
    expect(m![3]).toBe('16')
    expect(m![4]).toBe('USDc')
  })

  it('matches "- $65.600" (Mercado Pago $ prefix, no letter currency)', () => {
    const m = '- $65.600'.match(RE_AMOUNT)
    expect(m).not.toBeNull()
    expect(m![1]).toBe('-')
    expect(m![2]).toBe('$')
    expect(m![3]).toBe('65.600')
    expect(m![4]).toBeUndefined()
  })

  it('matches "- $16.048,50" with es-AR decimal comma', () => {
    const m = '- $16.048,50'.match(RE_AMOUNT)
    expect(m).not.toBeNull()
    expect(m![1]).toBe('-')
    expect(m![2]).toBe('$')
    expect(m![3]).toBe('16.048,50')
  })

  it('matches "+ $12.478,24"', () => {
    const m = '+ $12.478,24'.match(RE_AMOUNT)
    expect(m).not.toBeNull()
    expect(m![1]).toBe('+')
    expect(m![2]).toBe('$')
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

  it('matches "Junio 2026" (mes año)', () => {
    expect(RE_SECTION.test('Junio 2026')).toBe(true)
  })

  it('matches "31 de mayo" (Mercado Pago día + de + mes)', () => {
    expect(RE_SECTION.test('31 de mayo')).toBe(true)
  })

  it('matches "1 de junio" with single-digit día', () => {
    expect(RE_SECTION.test('1 de junio')).toBe(true)
  })

  it('matches "31 de mayo 2026" with year', () => {
    expect(RE_SECTION.test('31 de mayo 2026')).toBe(true)
  })

  it('matches "31 de mayo de 2026" with "de" before year', () => {
    expect(RE_SECTION.test('31 de mayo de 2026')).toBe(true)
  })

  it('does not match "01 jun 2026" (per-row date format)', () => {
    expect(RE_SECTION.test('01 jun 2026')).toBe(false)
  })
})

describe('sectionToISODate', () => {
  it('converts "31 de mayo" with defaultYear 2026', () => {
    expect(sectionToISODate('31 de mayo', 2026)).toBe('2026-05-31')
  })

  it('converts "1 de junio" pads day to two digits', () => {
    expect(sectionToISODate('1 de junio', 2026)).toBe('2026-06-01')
  })

  it('honors explicit year over defaultYear', () => {
    expect(sectionToISODate('15 de marzo 2025', 2026)).toBe('2025-03-15')
  })

  it('honors year with "de" prefix', () => {
    expect(sectionToISODate('15 de marzo de 2025', 2026)).toBe('2025-03-15')
  })

  it('returns null for "Hoy" / "Ayer" / month-year (caller decides)', () => {
    expect(sectionToISODate('Hoy', 2026)).toBeNull()
    expect(sectionToISODate('Ayer', 2026)).toBeNull()
    expect(sectionToISODate('Junio 2026', 2026)).toBeNull()
  })

  it('returns null for unknown month', () => {
    expect(sectionToISODate('31 de florales', 2026)).toBeNull()
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
