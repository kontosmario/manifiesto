import type { Amount, Line, Sign, Transaction, TransactionGroup } from '../types'
import { MONTHS_ES, RE_AMOUNT, RE_DATE, RE_SECTION } from './patterns'

const DEFAULT_COLUMN_DIVIDER_RATIO = 0.5

export function classify(
  group: TransactionGroup,
  imageWidth: number,
  columnDividerRatio: number = DEFAULT_COLUMN_DIVIDER_RATIO,
): Transaction | null {
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

  const dateLine = left.find((l) => RE_DATE.test(l.text)) ?? null
  // Defensa: si un section header quedó bundleado en el grupo por gap
  // chico, lo excluimos como candidato a merchant. parse-activity-lines
  // también lo extrae como section, pero este filtro garantiza que ni
  // siquiera lo elijamos acá.
  const merchantLine =
    left.find(
      (l) => l !== dateLine && !RE_AMOUNT.test(l.text) && !RE_SECTION.test(l.text),
    ) ?? null

  const amounts = right
    .slice()
    .sort((a, b) => a.frame.top - b.frame.top)
    .map((l) => parseAmount(l.text))
    .filter((a): a is Amount => a !== null)

  if (amounts.length === 0) return null

  return {
    merchant: merchantLine?.text.trim() ?? '',
    date: dateLine ? toISO(dateLine.text) : null,
    section: null,
    primaryAmount: amounts[0],
    secondaryAmount: amounts[1] ?? null,
    raw: group.lines.map((l) => l.text).join(' '),
  }
}

function parseAmount(text: string): Amount | null {
  const m = text.match(RE_AMOUNT)
  if (!m) return null
  const signChar = m[1]
  const sign: Sign = signChar === '+' ? 1 : -1
  const hasDollar = m[2] === '$'
  const currencyCode = m[4]
  // Exigir al menos uno de los dos indicadores de moneda; si falta,
  // no es un monto sino ruido (ej. "23:20 hs" en Mercado Pago no
  // tiene signo y no llega acá, pero un hipotético "- 100" sin nada
  // tampoco debería pasar como amount).
  if (!hasDollar && !currencyCode) return null
  const numeric = m[3].replace(/\./g, '').replace(',', '.')
  const value = Number.parseFloat(numeric)
  if (!Number.isFinite(value) || value < 0) return null
  // Si está el código de moneda, ese tiene prioridad. Si no, `$` →
  // ARS por default (Mercado Pago AR muestra solo `$`).
  const currency = currencyCode ?? 'ARS'
  return { value, currency, sign }
}

function toISO(text: string): string | null {
  const m = text.match(RE_DATE)
  if (!m) return null
  const day = m[1].padStart(2, '0')
  const monthKey = m[2].toLowerCase().slice(0, 3)
  const month = MONTHS_ES[monthKey]
  if (!month) return null
  return `${m[3]}-${month}-${day}`
}
