import type { ReviewRow, ReviewRowKind, ReviewRowWarning } from '@/features/import-review/types'
import { parseShortcutAmount } from './parse-shortcut-amount'
import {
  resolveCategoryForMerchant,
  type MerchantHistoryEntry,
} from './resolve-category-for-merchant'
import type { PendingCapture } from './types'

export interface CaptureMapContext {
  /** Hoy en YYYY-MM-DD local. */
  today: string
  history: readonly MerchantHistoryEntry[]
  /** Copy i18n para cuando Apple Pay no entrega comercio. */
  noDescriptionLabel: string
}

// Un tap NFC nunca es un ingreso; el campo existe sólo porque `ReviewRow`
// lo comparte con el import por OCR.
const DEFAULT_INCOME_KIND = 'other' as const

export function mapCapturesToReviewRows(
  captures: readonly PendingCapture[],
  ctx: CaptureMapContext,
): ReviewRow[] {
  return captures.map((capture) => mapOne(capture, ctx))
}

function mapOne(capture: PendingCapture, ctx: CaptureMapContext): ReviewRow {
  const warnings: ReviewRowWarning[] = []

  const parsed = parseShortcutAmount(capture.amountRaw)
  const amount = parsed?.value ?? 0
  if (parsed === null || parsed.value === 0) warnings.push('value-zero')
  if (parsed?.isRefund === true) warnings.push('refund')

  const merchant = capture.merchantRaw.trim()
  const hasMerchant = merchant !== ''
  if (!hasMerchant) warnings.push('no-merchant')

  // `capturedAt` es ISO-8601 en UTC; nos quedamos con la parte de fecha.
  // Un reloj adelantado o un viaje de zona horaria puede dejarla en el
  // futuro, y un gasto futuro no existe: la anclamos a hoy y avisamos.
  const rawDate = capture.capturedAt.slice(0, 10)
  const date = rawDate > ctx.today ? ctx.today : rawDate
  if (date !== rawDate) warnings.push('future-date')

  // Una devolución no es un gasto. Entra en `skip` para que el usuario
  // decida en vez de que la app la registre como consumo.
  const kind: ReviewRowKind = parsed?.isRefund === true ? 'skip' : 'expense'

  return {
    id: capture.id,
    kind,
    amount,
    description: hasMerchant ? merchant : ctx.noDescriptionLabel,
    date,
    notes: null,
    categoryId: hasMerchant ? resolveCategoryForMerchant(ctx.history, merchant) : null,
    incomeKind: DEFAULT_INCOME_KIND,
    warnings,
    source: { origin: 'apple-pay', capture },
  }
}
