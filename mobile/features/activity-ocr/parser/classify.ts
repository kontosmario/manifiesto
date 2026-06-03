import type { Amount, Line, Sign, Transaction, TransactionGroup } from '../types'
import {
  RE_AMOUNT,
  RE_DATE,
  RE_DATE_NUMERIC,
  RE_SECTION,
  rowDateToISO,
} from './patterns'

const DEFAULT_COLUMN_DIVIDER_RATIO = 0.5

export interface ClassifyOptions {
  columnDividerRatio?: number
  /**
   * Año a usar cuando una fecha por-fila viene sin año (ej. "29/05"
   * del Banco Macro). El orquestador `parseActivityLines` lo pasa por
   * default = año actual.
   */
  defaultYear?: number
}

export function classify(
  group: TransactionGroup,
  imageWidth: number,
  options: ClassifyOptions = {},
): Transaction | null {
  const columnDividerRatio =
    options.columnDividerRatio ?? DEFAULT_COLUMN_DIVIDER_RATIO
  const defaultYear = options.defaultYear ?? new Date().getFullYear()

  const mid = imageWidth * columnDividerRatio
  const left: Line[] = []
  const right: Line[] = []
  for (const line of group.lines) {
    ;(line.frame.left < mid ? left : right).push(line)
  }

  // Ordenar por Y ascendente para que merchantLine = primer línea
  // arriba de la columna izquierda (no depender del orden que ML Kit
  // devolvió).
  left.sort((a, b) => a.frame.top - b.frame.top)

  // Date line: o el formato "01 jun 2026" o el numérico "29/05" o
  // similares cubiertos por rowDateToISO.
  const dateLine =
    left.find((l) => RE_DATE.test(l.text) || RE_DATE_NUMERIC.test(l.text)) ?? null

  // Merchant: la primera línea de la columna izquierda que no es ni
  // fecha, ni amount, ni section header.
  const merchantLine =
    left.find(
      (l) =>
        l !== dateLine && !RE_AMOUNT.test(l.text) && !RE_SECTION.test(l.text),
    ) ?? null

  const amounts = right
    .slice()
    .sort((a, b) => a.frame.top - b.frame.top)
    .map((l) => parseAmount(l.text))
    .filter((a): a is Amount => a !== null)

  if (amounts.length === 0) return null

  return {
    merchant: merchantLine?.text.trim() ?? '',
    date: dateLine ? rowDateToISO(dateLine.text, defaultYear) : null,
    section: null,
    primaryAmount: amounts[0],
    secondaryAmount: amounts[1] ?? null,
    raw: group.lines.map((l) => l.text).join(' '),
  }
}

/**
 * Parser robusto de montos. Soporta múltiples formas observadas en
 * distintas apps financieras AR:
 *
 *   - `+ 26.000 ARS` / `- 16 USDc`     (bank con código de moneda)
 *   - `- $65.600`                       (Mercado Pago — $ tras signo)
 *   - `$ -5.000,00`                     (Francés — $ antes de signo)
 *   - `$ 3,03`                          (Francés positivo — sin signo explícito)
 *   - `+ $8,14`                         (Macro — signo + $ + número)
 *
 * Reglas:
 *   1. Exige `$` O un código de moneda de 2-5 letras. Si no hay
 *      ninguno, no es un monto (rechazo). Esto evita matchear "23:20 hs"
 *      o números sueltos como amounts.
 *   2. El signo puede aparecer antes o después del `$`, o no aparecer
 *      en absoluto. Si falta, asume positivo (caso `$ 3,03`).
 *   3. Número en formato es-AR: `.` miles, `,` decimal.
 *   4. Si el código de moneda está presente, usa ese; si no, asume
 *      "ARS" cuando el `$` está presente.
 */
function parseAmount(text: string): Amount | null {
  const trimmed = text.trim()

  // ¿Es siquiera amount-like? (filtra inputs sin sign ni $)
  if (!RE_AMOUNT.test(trimmed)) return null

  // 1. Buscar la secuencia numérica (es-AR: dígitos + . + ,)
  const numMatch = trimmed.match(/\d[\d.,]*/)
  if (!numMatch) return null
  const numStr = numMatch[0]
  const numStart = numMatch.index ?? 0

  // 2. Detectar $ (en cualquier posición)
  const hasDollar = trimmed.includes('$')

  // 3. Detectar signo (en cualquier posición, ANTES del número)
  const beforeNum = trimmed.slice(0, numStart)
  const signMatch = beforeNum.match(/[+\-−]/)
  const signChar = signMatch?.[0]

  // 4. Buscar código de moneda (2-5 letras) en lo que viene DESPUÉS del número.
  const afterNum = trimmed.slice(numStart + numStr.length).trim()
  const codeMatch = afterNum.match(/^([A-Za-z]{2,5})\b/)
  const currencyCode = codeMatch?.[1]

  // 5. Requerir uno de los dos indicadores.
  if (!hasDollar && !currencyCode) return null

  // 6. Parsear número.
  const numeric = numStr.replace(/\./g, '').replace(',', '.')
  const value = Number.parseFloat(numeric)
  if (!Number.isFinite(value) || value < 0) return null

  // 7. Signo: explícito o positivo implícito.
  const sign: Sign = signChar === '-' || signChar === '−' ? -1 : 1

  // 8. Currency: código explícito gana; si no, $ → ARS.
  const currency = currencyCode ?? 'ARS'

  return { value, currency, sign }
}
