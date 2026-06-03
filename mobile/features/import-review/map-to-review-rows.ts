import type { Transaction } from '@/features/activity-ocr/types'
import type { IncomeKind, ReviewRow, ReviewRowKind, ReviewRowWarning } from './types'

export interface MapContext {
  today: string
  defaultCategoryId: string | null
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
    description: hasMerchant ? merchant : '(sin descripción)',
    date: tx.date ?? ctx.today,
    notes: null,
    categoryId: kind === 'expense' ? ctx.defaultCategoryId : null,
    incomeKind: DEFAULT_INCOME_KIND,
    warnings,
    source: {
      transaction: tx,
      originalCurrency: currency,
      appliedRate,
    },
  }
}
