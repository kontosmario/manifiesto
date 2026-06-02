import type { Line, TransactionGroup } from '../types'

const DEFAULT_GAP_FACTOR = 1.8

export function groupRows(
  lines: readonly Line[],
  gapFactor: number = DEFAULT_GAP_FACTOR,
): TransactionGroup[] {
  if (lines.length === 0) return []
  const sorted = [...lines].sort((a, b) => a.frame.top - b.frame.top)
  const groups: TransactionGroup[] = []
  let cursorBottom = -Infinity
  let cursorReferenceHeight = 0

  for (const line of sorted) {
    const gap = line.frame.top - cursorBottom
    const threshold = (cursorReferenceHeight || line.frame.height) * gapFactor
    const isNewGroup = groups.length === 0 || gap > threshold
    if (isNewGroup) {
      groups.push({ lines: [line], top: line.frame.top })
    } else {
      const last = groups[groups.length - 1]
      last.lines.push(line)
      if (line.frame.top < last.top) last.top = line.frame.top
    }
    cursorBottom = line.frame.top + line.frame.height
    cursorReferenceHeight = line.frame.height
  }
  return groups
}
