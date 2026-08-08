export interface ParsedShortcutAmount {
  value: number
  isRefund: boolean
}

// El menos puede venir como guion ASCII o como el signo menos tipográfico
// que usan algunas locales al formatear números negativos.
const MINUS = /[-−]/

/**
 * Formas de monto que aceptamos. Son disjuntas entre sí a propósito: cada
 * una dice sin ambigüedad qué separador es de miles y cuál es decimal, así
 * que no hay nada que adivinar.
 *
 *  - `1000`                 → entero pelado
 *  - `4.500` / `1.234.567`  → sólo miles: grupos de 3 y SIEMPRE el mismo separador
 *  - `25,90` / `25,9`       → sólo decimales: 1 o 2 dígitos detrás del separador
 *  - `4.500,00` / `1,234.5` → miles + decimales, con separadores DISTINTOS
 */
const INTEGER_ONLY = /^\d+$/
const GROUPED_ONLY = /^\d{1,3}([.,])\d{3}(?:\1\d{3})*$/
const PLAIN_DECIMALS = /^\d+[.,]\d{1,2}$/
const GROUPED_WITH_DECIMALS = /^\d{1,3}([.,])\d{3}(?:\1\d{3})*([.,])\d{1,2}$/

/**
 * El disparador "Transacción" de Atajos entrega el monto como TEXTO de
 * moneda, no como número: `$4.500,00` en Argentina, `$4,500.00` en
 * EE.UU. Los dos usan `.` y `,` con el significado invertido, así que no
 * alcanza con borrar puntos.
 *
 * Regla: validamos la FORMA completa del monto contra las gramáticas de
 * arriba y devolvemos `null` ante cualquier otra cosa. Nunca se adivina un
 * número. Antes se miraba sólo el último separador y se lo tomaba como
 * decimal si lo seguían exactamente dos dígitos: eso multiplicaba por 10 o
 * por 1000 en silencio a todo monto con UN decimal (`25,9` → 259), que es
 * justo lo que manda Atajos cuando coerciona el monto numérico a texto
 * (`(4500.5).toLocaleString('es-AR')` === `'4.500,5'`, sin cero de relleno).
 *
 * Decisiones sobre lo ambiguo:
 *  - Un separador único seguido de 3 dígitos (`4.500`) es de MILES, no un
 *    decimal de 3 cifras. Es el caso realmente frecuente y ya estaba fijado
 *    por los tests.
 *  - `1.234,567` (miles + 3 decimales) y `4.500.00` (mismo separador dos
 *    veces con cola de 2) no son formato de ninguna locale: devuelven
 *    `null`. La fila entra con warning `value-zero` y el usuario completa
 *    el monto — degradación honesta en vez de un número inventado.
 *
 * El signo se devuelve aparte en vez de como número negativo: un gasto
 * negativo es una DEVOLUCIÓN, y quien llama decide qué hacer con eso.
 */
export function parseShortcutAmount(raw: string): ParsedShortcutAmount | null {
  let body = raw.trim()
  let isRefund = false

  // Paréntesis ENVOLVENTES = negativo: es como es-AR escribe los importes
  // negativos en estilo contable
  // (`Intl.NumberFormat('es-AR', { currencySign: 'accounting' })` da
  // `($ 4.500,00)`). Un paréntesis suelto al final —`(Visa ****-1234)`— no
  // envuelve nada y no cuenta.
  if (body.startsWith('(') && body.endsWith(')')) {
    isRefund = true
    body = body.slice(1, -1).trim()
  }

  // El signo se detecta por POSICIÓN, no con un `includes('-')`: sólo vale
  // el menos que esté ANTES del primer dígito, con o sin símbolo de moneda
  // en el medio (`-$4.500` y `$-4.500`). Un guion metido más adelante es de
  // otra cosa (el `****-1234` de la tarjeta) y no es un signo.
  const firstDigit = body.search(/\d/)
  if (firstDigit === -1) return null
  if (MINUS.test(body.slice(0, firstDigit))) isRefund = true

  // Nos quedamos sólo con dígitos y separadores; se van símbolo de
  // moneda, código ISO, espacios (incluido el no-rompible de iOS) y signo.
  const cleaned = body.replace(/[^\d.,]/g, '')

  const value = parseAmountShape(cleaned)
  if (value === null) return null

  return { value, isRefund }
}

function parseAmountShape(cleaned: string): number | null {
  if (INTEGER_ONLY.test(cleaned)) return toValue(cleaned, '')
  if (GROUPED_ONLY.test(cleaned)) return toValue(cleaned.replace(/[.,]/g, ''), '')
  if (PLAIN_DECIMALS.test(cleaned)) return splitAtLastSeparator(cleaned)

  const grouped = GROUPED_WITH_DECIMALS.exec(cleaned)
  // El separador decimal tiene que ser DISTINTO del de miles: `4.500.00` no
  // lo escribe ninguna locale, es ruido.
  if (grouped !== null && grouped[1] !== grouped[2]) return splitAtLastSeparator(cleaned)

  return null
}

function splitAtLastSeparator(cleaned: string): number | null {
  const cut = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','))
  return toValue(cleaned.slice(0, cut).replace(/[.,]/g, ''), cleaned.slice(cut + 1))
}

function toValue(integerDigits: string, decimalDigits: string): number | null {
  const integer = integerDigits === '' ? '0' : integerDigits
  const decimals = decimalDigits === '' ? '0' : decimalDigits
  const value = Number(`${integer}.${decimals}`)
  return Number.isFinite(value) ? value : null
}
