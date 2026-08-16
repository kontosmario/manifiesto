import { describe, expect, it } from 'vitest'
import { EXPENSE_PRICE_MAX } from '../../mobile/features/expenses/expense-repository.model'
import {
  deriveReviewTotals,
  isAmountOverCap,
  missingFieldsForRow,
} from '../../mobile/features/import-review/review-validation'
import type { ReviewRow } from '../../mobile/features/import-review/types'

const mkRow = (overrides: Partial<ReviewRow> = {}): ReviewRow => ({
  id: 'r1',
  kind: 'expense',
  amount: 1000,
  description: 'COTO',
  date: '2026-08-15',
  notes: null,
  categoryId: 'cat-1',
  categorySuggested: false,
  incomeKind: 'other',
  warnings: [],
  source: {
    origin: 'ocr',
    transaction: {
      merchant: 'COTO',
      date: '2026-08-15',
      section: null,
      primaryAmount: { value: 1000, currency: 'ARS', sign: -1 },
      secondaryAmount: null,
      raw: 'COTO 1000',
    },
    originalCurrency: 'ARS',
    appliedRate: null,
  },
  ...overrides,
})

describe('missingFieldsForRow', () => {
  it('una fila completa no tiene campos faltantes', () => {
    expect(missingFieldsForRow(mkRow())).toEqual([])
  })

  it('una fila salteada está exenta aunque le falte todo', () => {
    const row = mkRow({ kind: 'skip', description: '', amount: 0, categoryId: null })
    expect(missingFieldsForRow(row)).toEqual([])
  })

  it('marca la descripción vacía', () => {
    expect(missingFieldsForRow(mkRow({ description: '' }))).toHaveLength(1)
    expect(missingFieldsForRow(mkRow({ description: '   ' }))).toHaveLength(1)
  })

  it('marca el monto en 0', () => {
    expect(missingFieldsForRow(mkRow({ amount: 0 }))).toHaveLength(1)
  })

  it('marca la categoría faltante SÓLO en gastos', () => {
    expect(missingFieldsForRow(mkRow({ categoryId: null }))).toHaveLength(1)
    expect(missingFieldsForRow(mkRow({ kind: 'income', categoryId: null }))).toEqual([])
  })

  // Bug: el wizard validaba `amount > 0` y el insert exige
  // `price <= EXPENSE_PRICE_MAX`. Un monto mal parseado pasaba el gate verde
  // y explotaba recién en el insert, con la hoja ya cerrada.
  it('marca un monto por encima del tope del repositorio', () => {
    const over = mkRow({ amount: EXPENSE_PRICE_MAX + 1 })
    expect(missingFieldsForRow(over)).toHaveLength(1)
    expect(isAmountOverCap(over)).toBe(true)
  })

  it('acepta exactamente el tope', () => {
    const atCap = mkRow({ amount: EXPENSE_PRICE_MAX })
    expect(missingFieldsForRow(atCap)).toEqual([])
    expect(isAmountOverCap(atCap)).toBe(false)
  })

  it('el tope también aplica a un ingreso', () => {
    const over = mkRow({ kind: 'income', categoryId: null, amount: EXPENSE_PRICE_MAX + 1 })
    expect(missingFieldsForRow(over)).toHaveLength(1)
  })
})

describe('deriveReviewTotals', () => {
  it('suma la plata a cargar y la leída por separado', () => {
    const rows = [
      mkRow({ id: 'a', amount: 1000 }),
      mkRow({ id: 'b', amount: 2500 }),
      // Descartada: cuenta en lo leído, NO en lo que se carga.
      mkRow({ id: 'c', amount: 900, kind: 'skip' }),
    ]
    const d = deriveReviewTotals(rows)
    expect(d.submittableTotal).toBe(3500)
    expect(d.parsedTotal).toBe(4400)
    expect(d.skippedCount).toBe(1)
    expect(d.submittableCount).toBe(2)
  })

  it('el total usa el valor absoluto, así un ingreso no resta', () => {
    const rows = [
      mkRow({ id: 'a', amount: 1000 }),
      mkRow({ id: 'b', amount: 500, kind: 'income', categoryId: null }),
    ]
    const d = deriveReviewTotals(rows)
    expect(d.submittableTotal).toBe(1500)
    expect(d.submittableBreakdown).toEqual({ expenses: 1, incomes: 1 })
  })

  it('canConfirm es false con una fila incompleta y apunta a la primera', () => {
    const rows = [
      mkRow({ id: 'a' }),
      mkRow({ id: 'b', categoryId: null }),
      mkRow({ id: 'c', description: '' }),
    ]
    const d = deriveReviewTotals(rows)
    expect(d.canConfirm).toBe(false)
    expect(d.invalidIds).toEqual(['b', 'c'])
    expect(d.firstInvalidId).toBe('b')
  })

  it('canConfirm es false cuando no queda nada para cargar', () => {
    const d = deriveReviewTotals([mkRow({ id: 'a', kind: 'skip' })])
    expect(d.canConfirm).toBe(false)
    expect(d.invalidIds).toEqual([])
    expect(d.firstInvalidId).toBeNull()
  })

  it('canConfirm es true con todo completo', () => {
    const d = deriveReviewTotals([mkRow({ id: 'a' }), mkRow({ id: 'b' })])
    expect(d.canConfirm).toBe(true)
    expect(d.firstInvalidId).toBeNull()
  })

  it('un monto sobre el tope deja la fila inválida y bloquea el confirm', () => {
    const d = deriveReviewTotals([mkRow({ id: 'a', amount: EXPENSE_PRICE_MAX + 1 })])
    expect(d.canConfirm).toBe(false)
    expect(d.firstInvalidId).toBe('a')
  })
})
