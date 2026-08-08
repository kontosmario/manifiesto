import { normalizeMerchant } from './normalize-merchant'

export interface MerchantHistoryEntry {
  description: string
  categoryId: string
  createdAt: string
}

// Palabras demasiado comunes para sostener un match por sí solas. Sin
// esto, "Bar de la esquina" heredaría la categoría de "Kiosco de la
// esquina" por compartir "DE LA ESQUINA".
const STOPWORDS: ReadonlySet<string> = new Set([
  'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'EN', 'SA', 'SRL', 'S', 'A',
  'ESQUINA', 'LOCAL', 'SUCURSAL', 'STORE', 'SHOP', 'THE', 'OF',
])

function significantTokens(normalized: string): string[] {
  return normalized.split(' ').filter((token) => token !== '' && !STOPWORDS.has(token))
}

function isMatch(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return false
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  const longerSet = new Set(longer)
  return shorter.every((token) => longerSet.has(token))
}

/**
 * Devuelve la categoría del gasto más reciente cuya descripción matchea
 * el comercio, o `null` si no hay ninguno.
 *
 * `null` es una respuesta legítima y frecuente, no un fallo: preseleccionar
 * una categoría equivocada es peor que no preseleccionar ninguna. Es la
 * misma decisión que ya toma el import por OCR
 * (`features/import-review/map-to-review-rows.ts:76`).
 */
export function resolveCategoryForMerchant(
  history: readonly MerchantHistoryEntry[],
  merchantRaw: string,
): string | null {
  const merchantTokens = significantTokens(normalizeMerchant(merchantRaw))
  if (merchantTokens.length === 0) return null

  let best: MerchantHistoryEntry | null = null
  for (const entry of history) {
    const entryTokens = significantTokens(normalizeMerchant(entry.description))
    if (!isMatch(merchantTokens, entryTokens)) continue
    if (best === null || entry.createdAt > best.createdAt) best = entry
  }

  return best?.categoryId ?? null
}
