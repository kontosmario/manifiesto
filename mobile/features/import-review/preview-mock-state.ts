import type { ReviewRow, ReviewState } from './types'

/**
 * Builds a deterministic mock `ReviewState` for the wizard's "preview"
 * mode in Settings. Ten varied movements covering the visual cases we
 * want to iterate on without burning IPA cycles:
 *
 *   - Multiple typical expense sizes (small / medium / large) to test
 *     the AmountCard compact rendering across magnitudes.
 *   - One income with an `incomeKind` other than `other` so the income
 *     kind picker has a non-default selection on entry.
 *   - A MercadoPago-style truncated merchant ("MERPAGO*MRPROVO") that
 *     the user complained about earlier — keeps that visual case
 *     pinned in the preview.
 *   - Two **pre-skipped** rows so the skipped state in the step strip
 *     is visible from step 1, not something the user has to reach by
 *     tapping "Saltear". Helps verify color encoding (warning tint)
 *     without action.
 *   - Dates span -7..0 days so the CycleDateSlider scrolls and the
 *     summary's `formatRelativeDate` exercises hoy/ayer/weekday paths.
 *
 * Dates are computed relative to today on each call so the slider
 * lights up the right tile regardless of when the preview is opened.
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

  const makeRow = (
    overrides: Partial<ReviewRow> & Pick<ReviewRow, 'id' | 'amount' | 'description' | 'date' | 'kind'>,
  ): ReviewRow => ({
    notes: null,
    categoryId: null,
    incomeKind: 'other',
    warnings: [],
    source: {
      transaction: {
        merchant: overrides.description,
        date: overrides.date,
        section: null,
        primaryAmount: {
          value: overrides.amount,
          currency: 'ARS',
          sign: overrides.kind === 'income' ? 1 : -1,
        },
        secondaryAmount: null,
        raw: 'preview',
      },
      originalCurrency: 'ARS',
      appliedRate: null,
    },
    ...overrides,
  })

  return {
    imageUri: '',
    unmatched: 0,
    rows: [
      makeRow({
        id: 'preview-01',
        kind: 'expense',
        amount: 12_500,
        // @i18n-ignore (mock data: nombre de comercio sintético para el preview del wizard, no es copy de producción)
        description: 'Mercado El Día',
        date: isoDaysAgo(0),
      }),
      makeRow({
        id: 'preview-02',
        kind: 'expense',
        amount: 185_000,
        description: 'Alquiler junio',
        date: isoDaysAgo(3),
      }),
      makeRow({
        id: 'preview-03',
        kind: 'income',
        amount: 850_000,
        description: 'Sueldo',
        date: isoDaysAgo(1),
        incomeKind: 'transfer',
      }),
      // Pre-skipped: lets the wizard show the warning-colored segment
      // in the strip from the first render.
      makeRow({
        id: 'preview-04',
        kind: 'skip',
        amount: 2_350,
        description: 'MERPAGO*MRPROVO',
        date: isoDaysAgo(5),
      }),
      makeRow({
        id: 'preview-05',
        kind: 'expense',
        amount: 89_400,
        // @i18n-ignore (mock data: nombre de comercio sintético para el preview del wizard, no es copy de producción)
        description: 'Carrefour Av. Pueyrredón',
        date: isoDaysAgo(2),
      }),
      makeRow({
        id: 'preview-06',
        kind: 'expense',
        amount: 4_800,
        // @i18n-ignore (mock data: nombre de comercio sintético para el preview del wizard, no es copy de producción)
        description: 'Cafetería',
        date: isoDaysAgo(0),
      }),
      makeRow({
        id: 'preview-07',
        kind: 'expense',
        amount: 32_500,
        description: 'Farmacia City',
        date: isoDaysAgo(4),
      }),
      makeRow({
        id: 'preview-08',
        kind: 'income',
        amount: 45_000,
        // @i18n-ignore (mock data: descripción de movimiento sintético para el preview del wizard, no es copy de producción)
        description: 'Devolución impuestos',
        date: isoDaysAgo(6),
        incomeKind: 'bonus',
      }),
      // Second pre-skipped: confirms warning color renders for
      // non-adjacent skipped segments too.
      makeRow({
        id: 'preview-09',
        kind: 'skip',
        amount: 1_100,
        // @i18n-ignore (mock data: descripción de movimiento sintético para el preview del wizard, no es copy de producción)
        description: 'Comisión bancaria',
        date: isoDaysAgo(7),
      }),
      makeRow({
        id: 'preview-10',
        kind: 'expense',
        amount: 67_200,
        description: 'Combustible YPF',
        date: isoDaysAgo(3),
      }),
    ],
  }
}

/**
 * Mock state para el diagnóstico de inserts REALES desde Settings
 * (device report 2026-06-12: "No se pudo cargar ningún movimiento" en
 * ambos paths de import, cero POSTs en edge logs — la excepción es
 * client-side y el OCR no hace falta para reproducirla).
 *
 * 5 filas con descripciones [TEST] y montos chicos e identificables
 * para borrarlas fácil después. A diferencia del preview, este state
 * se monta SIN `previewMode`: el confirm ejecuta los inserts de
 * verdad contra la familia del owner.
 */
export function buildRealInsertTestState(): ReviewState {
  const base = buildPreviewReviewState()
  const todayIso = base.rows[0].date
  const row = (
    overrides: Partial<ReviewRow> &
      Pick<ReviewRow, 'id' | 'amount' | 'description' | 'date' | 'kind'>,
  ): ReviewRow => ({
    ...base.rows[0],
    notes: null,
    categoryId: null,
    incomeKind: 'other',
    warnings: [],
    ...overrides,
  })
  return {
    imageUri: '',
    unmatched: 0,
    rows: [
      row({ id: 'real-test-01', kind: 'expense', amount: 111, description: '[TEST] Gasto uno', date: todayIso }),
      row({ id: 'real-test-02', kind: 'expense', amount: 222, description: '[TEST] Gasto dos', date: todayIso }),
      row({ id: 'real-test-03', kind: 'expense', amount: 333, description: '[TEST] Gasto tres', date: todayIso }),
      row({ id: 'real-test-04', kind: 'expense', amount: 444, description: '[TEST] Gasto cuatro', date: todayIso }),
      row({ id: 'real-test-05', kind: 'income', amount: 555, description: '[TEST] Ingreso uno', date: todayIso, incomeKind: 'other' }),
    ],
  }
}
