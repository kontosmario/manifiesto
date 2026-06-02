import type { Frame, Line } from '../types'

export function normalize(blocks: readonly unknown[]): Line[] {
  const lines: Line[] = []
  for (const block of blocks) {
    const innerLines = readInnerLines(block)
    for (const raw of innerLines) {
      const text = readText(raw)
      const frame = readFrame(raw)
      if (text.length > 0 && frame !== null) {
        lines.push({ text, frame })
      }
    }
  }
  return lines
}

function readInnerLines(block: unknown): unknown[] {
  if (
    block != null &&
    typeof block === 'object' &&
    'lines' in block &&
    Array.isArray((block as { lines: unknown[] }).lines)
  ) {
    return (block as { lines: unknown[] }).lines
  }
  return []
}

function readText(raw: unknown): string {
  if (
    raw != null &&
    typeof raw === 'object' &&
    'text' in raw &&
    typeof (raw as { text: unknown }).text === 'string'
  ) {
    return (raw as { text: string }).text.trim()
  }
  return ''
}

function readFrame(raw: unknown): Frame | null {
  if (raw == null || typeof raw !== 'object' || !('frame' in raw)) return null
  const f = (raw as { frame: unknown }).frame
  if (f == null || typeof f !== 'object') return null
  const flat = f as {
    top?: unknown
    left?: unknown
    width?: unknown
    height?: unknown
    boundingBox?: unknown
  }
  const source =
    typeof flat.top === 'number'
      ? flat
      : flat.boundingBox && typeof flat.boundingBox === 'object'
        ? (flat.boundingBox as Record<string, unknown>)
        : null
  if (!source) return null
  const top = numOr(source.top, 0)
  const left = numOr(source.left, 0)
  const width = numOr(source.width, 0)
  const height = numOr(source.height, 0)
  if (width <= 0 || height <= 0) return null
  return { top, left, width, height }
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
