import { normalizeMerchant } from './normalize-merchant'

export interface MerchantHistoryEntry {
  description: string
  categoryId: string
  createdAt: string
}

/** Entrada del historial con los tokens ya calculados. Ver `tokenizeMerchantHistory`. */
export interface TokenizedMerchantHistoryEntry {
  tokens: readonly string[]
  categoryId: string
  createdAt: string
}

// Palabras FUNCIONALES: artículos, preposiciones y formas societarias.
// Solas no sostienen un match — sin esto, "Bar de la esquina" heredaría la
// categoría de "Kiosco de la esquina" por compartir "DE LA".
//
// Ojo con qué entra acá: sustantivos como ESQUINA, LOCAL o STORE son parte
// del nombre propio del comercio, no relleno. Con ESQUINA en la lista, un
// bar llamado "La Esquina" se quedaba sin ningún token significativo y la
// sugerencia moría para siempre en ese comercio.
const STOPWORDS: ReadonlySet<string> = new Set([
  'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'EN', 'SA', 'SRL', 'S', 'A',
  'THE', 'OF',
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
 * `createdAt` puede llegar con offsets distintos (`Z` contra `-03:00`), y
 * ahí comparar los strings ordena mal: `2026-08-07T23:00:00-03:00` es
 * POSTERIOR a `2026-08-08T01:00:00Z` aunque textualmente parezca anterior.
 * Comparamos el instante real; si alguna fecha no parsea caemos a la
 * comparación textual para que el desempate siga siendo estable.
 */
function isMoreRecent(candidate: string, current: string): boolean {
  const candidateAt = Date.parse(candidate)
  const currentAt = Date.parse(current)
  if (Number.isNaN(candidateAt) || Number.isNaN(currentAt)) return candidate > current
  return candidateAt > currentAt
}

/**
 * Precalcula los tokens del historial. Normalizar es lo caro y no depende
 * de la captura, así que quien mapea una tanda lo hace UNA vez y después
 * llama a `resolveCategoryFromTokens` por fila.
 */
export function tokenizeMerchantHistory(
  history: readonly MerchantHistoryEntry[],
): TokenizedMerchantHistoryEntry[] {
  return history.map((entry) => ({
    tokens: significantTokens(normalizeMerchant(entry.description)),
    categoryId: entry.categoryId,
    createdAt: entry.createdAt,
  }))
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
export function resolveCategoryFromTokens(
  history: readonly TokenizedMerchantHistoryEntry[],
  merchantRaw: string,
): string | null {
  const merchantTokens = significantTokens(normalizeMerchant(merchantRaw))
  if (merchantTokens.length === 0) return null

  let best: TokenizedMerchantHistoryEntry | null = null
  for (const entry of history) {
    if (!isMatch(merchantTokens, entry.tokens)) continue
    if (best === null || isMoreRecent(entry.createdAt, best.createdAt)) best = entry
  }

  return best?.categoryId ?? null
}

/** Igual que `resolveCategoryFromTokens`, pero tokenizando el historial al vuelo. */
export function resolveCategoryForMerchant(
  history: readonly MerchantHistoryEntry[],
  merchantRaw: string,
): string | null {
  return resolveCategoryFromTokens(tokenizeMerchantHistory(history), merchantRaw)
}
