import type { Transaction } from '@/features/activity-ocr/types'
import type { IncomeKind, ReviewRow, ReviewRowKind, ReviewRowWarning } from './types'

export interface MapContext {
  today: string
  usdToArsRate: number
  generateRowId: () => string
}

const USD_LIKE: ReadonlySet<string> = new Set(['USD', 'USDc', 'USDT'])
const DEFAULT_INCOME_KIND: IncomeKind = 'other'

export function mapToReviewRows(
  transactions: readonly Transaction[],
  ctx: MapContext,
): ReviewRow[] {
  return transactions.map((tx) => mapOne(tx, ctx))
}

function mapOne(tx: Transaction, ctx: MapContext): ReviewRow {
  const currency = tx.primaryAmount.currency
  const isARS = currency === 'ARS'
  const isUsdLike = USD_LIKE.has(currency)
  const isForeign = !isARS && !isUsdLike

  const warnings: ReviewRowWarning[] = []

  let amount = tx.primaryAmount.value
  let appliedRate: number | null = null
  if (isUsdLike) {
    amount = Math.round(tx.primaryAmount.value * ctx.usdToArsRate * 100) / 100
    appliedRate = ctx.usdToArsRate
  } else if (isForeign) {
    warnings.push('foreign-currency')
  }

  if (
    tx.secondaryAmount &&
    tx.secondaryAmount.currency !== tx.primaryAmount.currency
  ) {
    warnings.push('swap-ambiguous')
  }

  const merchant = tx.merchant.trim()
  const hasMerchant = merchant !== ''
  if (!hasMerchant) warnings.push('no-merchant')
  if (tx.date === null) warnings.push('no-date')
  if (tx.primaryAmount.value === 0) warnings.push('value-zero')

  // Un gasto no puede ser futuro. Si el OCR parseó mal y devolvió una
  // fecha posterior a hoy, la anclamos a hoy (comparación lexicográfica
  // válida para YYYY-MM-DD) y marcamos un warning para que el usuario
  // la revise en el wizard. El slider además deshabilita los días
  // futuros, pero esto cubre el valor INICIAL de la fila.
  const rawDate = tx.date ?? ctx.today
  const date = rawDate > ctx.today ? ctx.today : rawDate
  if (date !== rawDate) warnings.push('future-date')

  const ambiguous =
    warnings.includes('foreign-currency') || warnings.includes('swap-ambiguous')

  const kind: ReviewRowKind = ambiguous
    ? 'skip'
    : tx.primaryAmount.sign === 1
      ? 'income'
      : 'expense'

  return {
    id: ctx.generateRowId(),
    kind,
    amount,
    // VACÍA cuando el OCR no leyó comercio, nunca un placeholder de relleno.
    // `"(sin descripción)"` como VALOR satisfacía la validación
    // (`description.trim() !== ''`), así que la fila pasaba el gate verde y
    // se insertaba un gasto real llamado así. Vacía, el campo muestra su
    // placeholder real y el footer la lista como faltante. El texto de
    // relleno sobrevive sólo como etiqueta de LECTURA en la bandeja y el
    // resumen (`gastos:import.noDescription`).
    description: merchant,
    date,
    notes: null,
    // Category intentionally left unset. Pre-selecting "first available"
    // led to silent miscategorization — users sailed past the picker
    // without realizing they'd accepted a default that didn't match
    // the actual purchase. Forcing manual pick on every expense costs
    // one tap per row, gains data integrity.
    categoryId: null,
    categorySuggested: false,
    incomeKind: DEFAULT_INCOME_KIND,
    warnings,
    source: {
      origin: 'ocr',
      transaction: tx,
      originalCurrency: currency,
      appliedRate,
    },
  }
}
