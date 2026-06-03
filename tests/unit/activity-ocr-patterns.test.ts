import { describe, expect, it } from 'vitest'
import {
  MONTHS_ES,
  RE_AMOUNT,
  RE_DATE,
  RE_DATE_NUMERIC,
  RE_SECTION,
  rowDateToISO,
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

describe('RE_AMOUNT (detector)', () => {
  // RE_AMOUNT es un detector "esto parece un monto" usado para
  // filtrar la columna izquierda al elegir merchant. La parsing real
  // de signo/valor/currency vive en parseAmount (classify.ts) y se
  // testea via fixtures en parse-lines.test.ts.

  it('matches sign-first form "- 26.000 ARS"', () => {
    expect(RE_AMOUNT.test('- 26.000 ARS')).toBe(true)
  })

  it('matches sign-first with $: "- $65.600"', () => {
    expect(RE_AMOUNT.test('- $65.600')).toBe(true)
  })

  it('matches Unicode minus "− 16 USDc"', () => {
    expect(RE_AMOUNT.test('− 16 USDc')).toBe(true)
  })

  it('matches "+ $8,14" (Macro)', () => {
    expect(RE_AMOUNT.test('+ $8,14')).toBe(true)
  })

  it('matches $-first negative "$ -5.000,00" (Francés)', () => {
    expect(RE_AMOUNT.test('$ -5.000,00')).toBe(true)
  })

  it('matches $-first positive without sign "$ 3,03" (Francés)', () => {
    expect(RE_AMOUNT.test('$ 3,03')).toBe(true)
  })

  it('does not match "USDc → ARS"', () => {
    expect(RE_AMOUNT.test('USDc → ARS')).toBe(false)
  })

  it('does not match a bare time "23:20 hs"', () => {
    expect(RE_AMOUNT.test('23:20 hs')).toBe(false)
  })

  it('does not match a bare date "29/05"', () => {
    expect(RE_AMOUNT.test('29/05')).toBe(false)
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

  it('matches bare month name "Mayo" (Banco Macro)', () => {
    expect(RE_SECTION.test('Mayo')).toBe(true)
    expect(RE_SECTION.test('mayo')).toBe(true)
    expect(RE_SECTION.test('Diciembre')).toBe(true)
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

  it('matches "02 de junio de 2026" with "de" before year (Francés)', () => {
    expect(RE_SECTION.test('02 de junio de 2026')).toBe(true)
  })

  it('does not match arbitrary Spanish word "Operacion"', () => {
    expect(RE_SECTION.test('Operacion')).toBe(false)
  })

  it('does not match "01 jun 2026" (per-row date format)', () => {
    expect(RE_SECTION.test('01 jun 2026')).toBe(false)
  })
})

describe('RE_DATE_NUMERIC', () => {
  it('matches "29/05" (día/mes sin año, Banco Macro)', () => {
    expect(RE_DATE_NUMERIC.test('29/05')).toBe(true)
  })

  it('matches "29/05/26" (año a 2 dígitos)', () => {
    expect(RE_DATE_NUMERIC.test('29/05/26')).toBe(true)
  })

  it('matches "29/05/2026" (año a 4 dígitos)', () => {
    expect(RE_DATE_NUMERIC.test('29/05/2026')).toBe(true)
  })

  it('does not match "01 jun 2026" (formato de texto)', () => {
    expect(RE_DATE_NUMERIC.test('01 jun 2026')).toBe(false)
  })
})

describe('rowDateToISO', () => {
  it('parsea "01 jun 2026" → "2026-06-01"', () => {
    expect(rowDateToISO('01 jun 2026', 2026)).toBe('2026-06-01')
  })

  it('parsea "29/05" sin año → usa defaultYear', () => {
    expect(rowDateToISO('29/05', 2026)).toBe('2026-05-29')
  })

  it('parsea "29/05/26" — año a 2 dígitos se asume 20XX', () => {
    expect(rowDateToISO('29/05/26', 2099)).toBe('2026-05-29')
  })

  it('parsea "29/05/2026" — año a 4 dígitos gana sobre defaultYear', () => {
    expect(rowDateToISO('29/05/2026', 2099)).toBe('2026-05-29')
  })

  it('pad de día/mes a 2 dígitos: "1/6" → "2026-06-01"', () => {
    expect(rowDateToISO('1/6', 2026)).toBe('2026-06-01')
  })

  it('returns null para texto que no es fecha', () => {
    expect(rowDateToISO('Hoy', 2026)).toBeNull()
    expect(rowDateToISO('whatever', 2026)).toBeNull()
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
