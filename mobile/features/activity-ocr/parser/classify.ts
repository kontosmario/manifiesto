import type { Amount, Line, Sign, Transaction, TransactionGroup } from '../types'
import { MONTHS_ES, RE_AMOUNT, RE_DATE } from './patterns'

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

  const dateLine = left.find((l) => RE_DATE.test(l.text)) ?? null
  const merchantLine =
    left.find((l) => l !== dateLine && !RE_AMOUNT.test(l.text)) ?? null

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
  const numeric = m[2].replace(/\./g, '').replace(',', '.')
  const value = Number.parseFloat(numeric)
  if (!Number.isFinite(value) || value < 0) return null
  return { value, currency: m[3], sign }
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
