import type { Line, ParseResult, Transaction, TransactionGroup } from './types'
import { classify } from './parser/classify'
import { groupRows } from './parser/group-rows'
import { RE_SECTION } from './parser/patterns'

export interface ParseLinesOptions {
  gapFactor?: number
  columnDividerRatio?: number
}

export function parseActivityLines(
  lines: readonly Line[],
  imageWidth: number,
  options: ParseLinesOptions = {},
): ParseResult {
  if (lines.length === 0 || imageWidth <= 0) {
    return { transactions: [], unmatched: [] }
  }

  const groups = groupRows(lines, options.gapFactor)
  groups.sort((a, b) => a.top - b.top)

  const transactions: Transaction[] = []
  const unmatched: TransactionGroup[] = []
  let currentSection: string | null = null

  for (const group of groups) {
    if (group.lines.length === 1 && RE_SECTION.test(group.lines[0].text)) {
      currentSection = group.lines[0].text
      continue
    }
    const tx = classify(group, imageWidth, options.columnDividerRatio)
    if (tx) {
      tx.section = currentSection
      transactions.push(tx)
    } else {
      unmatched.push(group)
    }
  }
  return { transactions, unmatched }
}
