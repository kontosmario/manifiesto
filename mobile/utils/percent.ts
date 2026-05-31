/**
 * Format a fractional delta (e.g. 0.17 → "+17%") as a signed
 * percentage string. NaN / null / non-finite values render as
 * "Sin base" (Spanish UI copy — moved here so feature modules
 * don't need to depend on each other for a 5-line function).
 */
export function formatDeltaPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return 'Sin base'
  }
  const rounded = Math.round(value * 100)
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}
