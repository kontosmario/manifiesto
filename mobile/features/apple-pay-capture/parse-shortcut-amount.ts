export interface ParsedShortcutAmount {
  value: number
  isRefund: boolean
}

/**
 * El disparador "Transacción" de Atajos entrega el monto como TEXTO de
 * moneda, no como número: `$4.500,00` en Argentina, `$4,500.00` en
 * EE.UU. Los dos usan `.` y `,` con el significado invertido, así que no
 * alcanza con borrar puntos.
 *
 * Regla: el ÚLTIMO separador es el decimal sólo si lo siguen exactamente
 * dos dígitos. En cualquier otro caso todos los separadores son de miles.
 * Esto resuelve bien `$4.500` (=4500) y `$25,90` (=25.9), que es donde un
 * parser ingenuo se rompe.
 *
 * El signo se devuelve aparte en vez de como número negativo: un gasto
 * negativo es una DEVOLUCIÓN, y quien llama decide qué hacer con eso.
 */
export function parseShortcutAmount(raw: string): ParsedShortcutAmount | null {
  const isRefund = raw.includes('-')

  // Nos quedamos sólo con dígitos y separadores; se van símbolo de
  // moneda, código ISO, espacios (incluido el no-rompible de iOS) y signo.
  const cleaned = raw.replace(/[^\d.,]/g, '')
  if (!/\d/.test(cleaned)) return null

  const lastSeparator = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','))

  let integerPart = cleaned
  let decimalPart = ''

  if (lastSeparator !== -1) {
    const tail = cleaned.slice(lastSeparator + 1)
    if (/^\d{2}$/.test(tail)) {
      integerPart = cleaned.slice(0, lastSeparator)
      decimalPart = tail
    }
  }

  const digits = integerPart.replace(/[.,]/g, '')
  const normalized = `${digits === '' ? '0' : digits}.${decimalPart === '' ? '0' : decimalPart}`
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null

  return { value, isRefund }
}
