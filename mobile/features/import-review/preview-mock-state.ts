import type { ReviewState } from './types'

/**
 * Builds a deterministic mock `ReviewState` for the wizard's "preview"
 * mode in Settings. The fixture mixes the cases we actually want to
 * iterate on visually:
 *
 *   1. Typical small expense — happy-path baseline.
 *   2. Large expense — stress-test the big-number rendering on
 *      AmountCard.
 *   3. Income — flips the kind toggle so we can see the "ingreso"
 *      copy and the income-kind picker.
 *   4. MercadoPago-style truncated merchant — what the user complained
 *      about in the screenshot ("MERPAGO*MRPROVO..").
 *   5. Mid-range expense with a date a few days back — covers the
 *      CycleDateSlider scrolling away from "today".
 *
 * Dates are computed relative to today so the slider lights up
 * correctly regardless of when the preview is opened.
 *
 * `imageUri` is intentionally empty — preview mode hides the
 * screenshot thumbnail because the wizard didn't actually OCR anything
 * (no real screenshot to show).
 */
export function buildPreviewReviewState(): ReviewState {
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const isoDaysAgo = (n: number): string => {
    const d = new Date(today)
    d.setDate(d.getDate() - n)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  return {
    imageUri: '',
    unmatched: 0,
    rows: [
      {
        id: 'preview-1',
        kind: 'expense',
        amount: 12_500,
        description: 'Mercado El Día',
        date: isoDaysAgo(0),
        notes: null,
        categoryId: null,
        incomeKind: 'other',
        warnings: [],
        source: {
          transaction: {
            merchant: 'Mercado El Día',
            date: isoDaysAgo(0),
            section: null,
            primaryAmount: { value: 12_500, currency: 'ARS', sign: -1 },
            secondaryAmount: null,
            raw: 'preview',
          },
          originalCurrency: 'ARS',
          appliedRate: null,
        },
      },
      {
        id: 'preview-2',
        kind: 'expense',
        amount: 185_000,
        description: 'Alquiler junio',
        date: isoDaysAgo(3),
        notes: null,
        categoryId: null,
        incomeKind: 'other',
        warnings: [],
        source: {
          transaction: {
            merchant: 'Alquiler junio',
            date: isoDaysAgo(3),
            section: null,
            primaryAmount: { value: 185_000, currency: 'ARS', sign: -1 },
            secondaryAmount: null,
            raw: 'preview',
          },
          originalCurrency: 'ARS',
          appliedRate: null,
        },
      },
      {
        id: 'preview-3',
        kind: 'income',
        amount: 850_000,
        description: 'Sueldo',
        date: isoDaysAgo(1),
        notes: null,
        categoryId: null,
        incomeKind: 'transfer',
        warnings: [],
        source: {
          transaction: {
            merchant: 'Sueldo',
            date: isoDaysAgo(1),
            section: null,
            primaryAmount: { value: 850_000, currency: 'ARS', sign: 1 },
            secondaryAmount: null,
            raw: 'preview',
          },
          originalCurrency: 'ARS',
          appliedRate: null,
        },
      },
      {
        id: 'preview-4',
        kind: 'expense',
        amount: 2_350,
        description: 'MERPAGO*MRPROVO',
        date: isoDaysAgo(5),
        notes: null,
        categoryId: null,
        incomeKind: 'other',
        warnings: [],
        source: {
          transaction: {
            merchant: 'MERPAGO*MRPROVO',
            date: isoDaysAgo(5),
            section: null,
            primaryAmount: { value: 2_350, currency: 'ARS', sign: -1 },
            secondaryAmount: null,
            raw: 'preview',
          },
          originalCurrency: 'ARS',
          appliedRate: null,
        },
      },
      {
        id: 'preview-5',
        kind: 'expense',
        amount: 89_400,
        description: 'Carrefour Av. Pueyrredón',
        date: isoDaysAgo(2),
        notes: null,
        categoryId: null,
        incomeKind: 'other',
        warnings: [],
        source: {
          transaction: {
            merchant: 'Carrefour Av. Pueyrredón',
            date: isoDaysAgo(2),
            section: null,
            primaryAmount: { value: 89_400, currency: 'ARS', sign: -1 },
            secondaryAmount: null,
            raw: 'preview',
          },
          originalCurrency: 'ARS',
          appliedRate: null,
        },
      },
    ],
  }
}
