import type { ReviewRow, ReviewRowKind, ReviewRowWarning } from '@/features/import-review/types'
import { formatLocalDateKey } from '@/utils/pay-cycle'
import { parseShortcutAmount } from './parse-shortcut-amount'
import {
  resolveCategoryFromTokens,
  tokenizeMerchantHistory,
  type MerchantHistoryEntry,
  type TokenizedMerchantHistoryEntry,
} from './resolve-category-for-merchant'
import type { PendingCapture } from './types'

export interface CaptureMapContext {
  /** Hoy en YYYY-MM-DD local. */
  today: string
  history: readonly MerchantHistoryEntry[]
}

// Un tap NFC nunca es un ingreso; el campo existe sólo porque `ReviewRow`
// lo comparte con el import por OCR.
const DEFAULT_INCOME_KIND = 'other' as const

export function mapCapturesToReviewRows(
  captures: readonly PendingCapture[],
  ctx: CaptureMapContext,
): ReviewRow[] {
  // Tokenizamos el historial UNA vez por tanda. Resolviendo por fila se
  // re-normalizaba el historial ENTERO en cada captura: 61 ms con 50
  // capturas y 800 gastos en Node de escritorio, y en Hermes sobre un
  // iPhone viejo bastante más. Esto corre justo al abrir el sheet.
  const history = tokenizeMerchantHistory(ctx.history)
  return captures.map((capture) => mapOne(capture, ctx, history))
}

function mapOne(
  capture: PendingCapture,
  ctx: CaptureMapContext,
  history: readonly TokenizedMerchantHistoryEntry[],
): ReviewRow {
  const warnings: ReviewRowWarning[] = []

  const parsed = parseShortcutAmount(capture.amountRaw)
  const amount = parsed?.value ?? 0
  if (parsed === null || parsed.value === 0) warnings.push('value-zero')
  if (parsed?.isRefund === true) warnings.push('refund')

  const merchant = capture.merchantRaw.trim()
  const hasMerchant = merchant !== ''
  if (!hasMerchant) warnings.push('no-merchant')

  // `capturedAt` es el INSTANTE del pago (ISO-8601, en UTC o con offset).
  // Lo pasamos al día LOCAL del usuario en vez de cortarle el string: eso
  // daba el día UTC y en Argentina (UTC-3) toda compra después de las 21:00
  // caía al día siguiente — salía con `future-date` esa misma noche, o
  // fechada un día tarde si se drenaba a la mañana. Y no es cosmético:
  // `use-confirm-import.ts` ancla el gasto a este string, así que define el
  // día del gasto y su bucket de cupo diario.
  //
  // Un reloj adelantado o un viaje de zona horaria puede dejarla igual en
  // el futuro, y un gasto futuro no existe: la anclamos a hoy y avisamos.
  const capturedAt = new Date(capture.capturedAt)
  const rawDate = Number.isNaN(capturedAt.getTime()) ? ctx.today : formatLocalDateKey(capturedAt)
  const date = rawDate > ctx.today ? ctx.today : rawDate
  if (date !== rawDate) warnings.push('future-date')

  // Una devolución no es un gasto. Entra en `skip` para que el usuario
  // decida en vez de que la app la registre como consumo.
  const kind: ReviewRowKind = parsed?.isRefund === true ? 'skip' : 'expense'

  const suggestedCategoryId = hasMerchant
    ? resolveCategoryFromTokens(history, merchant)
    : null

  return {
    id: capture.id,
    kind,
    amount,
    // VACÍA cuando Atajos no entrega comercio — mismo criterio que el
    // camino OCR: un placeholder como VALOR pasaba la validación y se
    // insertaba un gasto llamado "(sin descripción)".
    description: merchant,
    date,
    notes: null,
    categoryId: suggestedCategoryId,
    // La sugerencia se CONFIESA: el chip "sugerida" del riel es lo que
    // convierte un dato adivinado en un dato auditable. Sin esto, un chip
    // seleccionado es indistinguible de una elección propia y nadie lo revisa.
    categorySuggested: suggestedCategoryId !== null,
    incomeKind: DEFAULT_INCOME_KIND,
    warnings,
    source: { origin: 'apple-pay', capture },
  }
}
