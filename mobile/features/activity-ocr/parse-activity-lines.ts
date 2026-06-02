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
    // Detectá CUALQUIER línea del grupo que matchee section header
    // ("Hoy" / "Ayer" / "<Mes Año>"). Esto cubre dos casos:
    //   a) Grupo standalone de una línea con el header (gap suficiente
    //      lo separó del próximo bloque).
    //   b) Grupo "merged": el header quedó pegado a la primera tx
    //      porque ML Kit no dejó suficiente gap vertical entre el
    //      header y la fila siguiente. En ese caso el header está
    //      bundleado con las líneas de la tx; lo extraemos antes de
    //      clasificar.
    const sectionLine = group.lines.find((l) => RE_SECTION.test(l.text)) ?? null
    if (sectionLine) {
      currentSection = sectionLine.text
    }

    // Si era standalone, no queda nada más para clasificar.
    if (sectionLine && group.lines.length === 1) continue

    const groupForClassify: TransactionGroup = sectionLine
      ? { lines: group.lines.filter((l) => l !== sectionLine), top: group.top }
      : group

    const tx = classify(groupForClassify, imageWidth, options.columnDividerRatio)
    if (tx) {
      tx.section = currentSection
      transactions.push(tx)
    } else {
      unmatched.push(group)
    }
  }
  return { transactions, unmatched }
}
