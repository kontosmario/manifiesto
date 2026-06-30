/**
 * Guards numéricos compartidos del asistente financiero.
 *
 * El asistente es 100% determinístico (sin LLM): la única forma de que muestre
 * un dato "errático" es propagar un `NaN`/`Infinity` o dividir por algo
 * inválido. Estos helpers cortan esa propagación en la raíz, para sostener el
 * invariante del sistema: **dato válido o ausente, nunca errático.**
 */

/** `true` sólo si `n` es un número finito (descarta NaN, ±Infinity, no-number). */
export function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/** Devuelve `n` si es finito, sino `fallback`. */
export function finiteOr(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback
}

/**
 * División segura. Devuelve `null` si el divisor es 0 / no finito, el dividendo
 * no es finito, o el resultado no es finito. Los callers deben tratar `null`
 * como "no se puede calcular" (suprimir la señal / métrica).
 */
export function safeDiv(num: number, den: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null
  const r = num / den
  return Number.isFinite(r) ? r : null
}

/** `Math.max(0, n)` pero `null` si `n` no es finito. */
export function nonNegFinite(n: number): number | null {
  if (!Number.isFinite(n)) return null
  return n < 0 ? 0 : n
}

/** `true` si TODOS los argumentos son números finitos. */
export function allFinite(...ns: number[]): boolean {
  return ns.every((n) => Number.isFinite(n))
}

/** Clampa `n` a `[min, max]`; si `n` no es finito devuelve `min`. */
export function clampFinite(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  if (n < min) return min
  if (n > max) return max
  return n
}
