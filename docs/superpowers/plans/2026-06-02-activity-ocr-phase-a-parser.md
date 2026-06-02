# Activity OCR — Phase A: Parser Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure TypeScript parser library under `mobile/features/activity-ocr/` that turns `Line[] + imageWidth` into a `ParseResult { transactions, unmatched }` using regex + positional rules. No native modules, no DB, no UI — fully testable under vitest with the project's existing config.

**Architecture:** Seven small focused modules — types, patterns (regex), normalize (defensive any→Line[]), group-rows (Y-clustering), classify (column-split + regex), parse-activity-lines (pure orchestrator), activity-parser (stub for the URI entry point Phase B will implement). Each module is independent and tested in isolation; the orchestrator integrates them. Test pyramid: pattern unit tests at the base, module-level tests in the middle, an end-to-end fixture of the brief's reference screenshot at the top.

**Tech Stack:** TypeScript strict, vitest (env `node`, no React renderer per `[[feedback-vitest-no-react-renderer]]`), no runtime deps.

**Spec:** `docs/superpowers/specs/2026-06-02-activity-ocr-phase-a-parser-design.md`

**Branch:** `feature/activity-ocr` (off main; will NOT merge to main until all 5 phases ship). Commit frequently.

---

## File map

**Create:**
- `mobile/features/activity-ocr/types.ts` — All domain types: `Frame`, `Line`, `TransactionGroup`, `Amount`, `Sign`, `Transaction`, `ParseResult`.
- `mobile/features/activity-ocr/parser/patterns.ts` — `RE_DATE`, `RE_AMOUNT`, `RE_SECTION`, `MONTHS_ES`.
- `mobile/features/activity-ocr/parser/normalize.ts` — `normalize(blocks: readonly unknown[]): Line[]` defensive against ML Kit frame-shape variants.
- `mobile/features/activity-ocr/parser/group-rows.ts` — `groupRows(lines, gapFactor?): TransactionGroup[]` Y-clustering.
- `mobile/features/activity-ocr/parser/classify.ts` — `classify(group, imageWidth, columnDividerRatio?): Transaction | null` column split + regex.
- `mobile/features/activity-ocr/parse-activity-lines.ts` — `parseActivityLines(lines, imageWidth, options?): ParseResult` orchestrator with section inheritance.
- `mobile/features/activity-ocr/activity-parser.ts` — `parseActivity(uri): Promise<ParseResult>` stub that throws until Phase B.

**Create test files** (vitest, env node):
- `tests/unit/activity-ocr-patterns.test.ts`
- `tests/unit/activity-ocr-normalize.test.ts`
- `tests/unit/activity-ocr-group-rows.test.ts`
- `tests/unit/activity-ocr-classify.test.ts`
- `tests/unit/activity-ocr-parse-lines.test.ts`

**Modify:** none. No deps, no migrations, no UI, no docs (the spec already documents the design).

---

## Task 1: Domain types

**Files:**
- Create: `mobile/features/activity-ocr/types.ts`

Types are pure type declarations and have no runtime behavior to test directly. They will be type-checked by `tsc` once subsequent tasks import them.

- [ ] **Step 1.1: Create the types file**

Create `mobile/features/activity-ocr/types.ts` with the full content:

```ts
export interface Frame {
  top: number
  left: number
  width: number
  height: number
}

export interface Line {
  text: string
  frame: Frame
}

export interface TransactionGroup {
  lines: Line[]
  top: number
}

export type Sign = 1 | -1

export interface Amount {
  value: number
  currency: string
  sign: Sign
}

export interface Transaction {
  merchant: string
  date: string | null
  section: string | null
  primaryAmount: Amount
  secondaryAmount: Amount | null
  raw: string
}

export interface ParseResult {
  transactions: Transaction[]
  unmatched: TransactionGroup[]
}
```

- [ ] **Step 1.2: Typecheck**

Run: `npm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 1.3: Commit**

```bash
git add mobile/features/activity-ocr/types.ts
git commit -m "$(cat <<'EOF'
feat(activity-ocr): domain types for Phase A parser library

Frame, Line, TransactionGroup, Amount (with Sign literal), Transaction,
ParseResult. These are the public contracts every subsequent module
in mobile/features/activity-ocr/ consumes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Regex patterns + month map

**Files:**
- Create: `mobile/features/activity-ocr/parser/patterns.ts`
- Test: `tests/unit/activity-ocr-patterns.test.ts`

- [ ] **Step 2.1: Write the failing tests**

Create `tests/unit/activity-ocr-patterns.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  MONTHS_ES,
  RE_AMOUNT,
  RE_DATE,
  RE_SECTION,
} from '../../mobile/features/activity-ocr/parser/patterns'

describe('RE_DATE', () => {
  it('matches "01 jun 2026"', () => {
    expect(RE_DATE.test('01 jun 2026')).toBe(true)
  })

  it('matches "1 Jun. 2026" with capitalization and trailing period', () => {
    expect(RE_DATE.test('1 Jun. 2026')).toBe(true)
  })

  it('does not match "ayer"', () => {
    expect(RE_DATE.test('ayer')).toBe(false)
  })

  it('does not match numeric "01/06/2026"', () => {
    expect(RE_DATE.test('01/06/2026')).toBe(false)
  })
})

describe('RE_AMOUNT', () => {
  it('matches "- 26.000 ARS"', () => {
    const m = '- 26.000 ARS'.match(RE_AMOUNT)
    expect(m).not.toBeNull()
    expect(m![1]).toBe('-')
    expect(m![2]).toBe('26.000')
    expect(m![3]).toBe('ARS')
  })

  it('matches "+ 23.697,71 ARS"', () => {
    const m = '+ 23.697,71 ARS'.match(RE_AMOUNT)
    expect(m).not.toBeNull()
    expect(m![1]).toBe('+')
    expect(m![2]).toBe('23.697,71')
    expect(m![3]).toBe('ARS')
  })

  it('matches Unicode minus "− 16 USDc"', () => {
    const m = '− 16 USDc'.match(RE_AMOUNT)
    expect(m).not.toBeNull()
    expect(m![1]).toBe('−')
    expect(m![3]).toBe('USDc')
  })

  it('does not match "USDc → ARS"', () => {
    expect('USDc → ARS'.match(RE_AMOUNT)).toBeNull()
  })
})

describe('RE_SECTION', () => {
  it('matches "Hoy" case-insensitive', () => {
    expect(RE_SECTION.test('Hoy')).toBe(true)
    expect(RE_SECTION.test('hoy')).toBe(true)
  })

  it('matches "Ayer"', () => {
    expect(RE_SECTION.test('Ayer')).toBe(true)
  })

  it('matches "Junio 2026"', () => {
    expect(RE_SECTION.test('Junio 2026')).toBe(true)
  })

  it('does not match "01 jun 2026"', () => {
    expect(RE_SECTION.test('01 jun 2026')).toBe(false)
  })
})

describe('MONTHS_ES', () => {
  it('maps "jun" → "06"', () => {
    expect(MONTHS_ES.jun).toBe('06')
  })

  it('covers all 12 months', () => {
    expect(Object.keys(MONTHS_ES)).toHaveLength(12)
  })
})
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/activity-ocr-patterns.test.ts`
Expected: FAIL — `Cannot find module .../parser/patterns`.

- [ ] **Step 2.3: Implement the patterns module**

Create `mobile/features/activity-ocr/parser/patterns.ts`:

```ts
export const RE_DATE = /^(\d{1,2})\s+([a-záéíóú]{3,})\.?\s+(\d{4})$/i

export const RE_AMOUNT = /([+\-−])\s*([\d.,]+)\s*([A-Za-z]{2,5})/

export const RE_SECTION = /^(hoy|ayer|[a-záéíóú]+\s+\d{4})$/i

export const MONTHS_ES: Readonly<Record<string, string>> = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12',
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/activity-ocr-patterns.test.ts`
Expected: PASS, all assertions green.

- [ ] **Step 2.5: Commit**

```bash
git add mobile/features/activity-ocr/parser/patterns.ts tests/unit/activity-ocr-patterns.test.ts
git commit -m "$(cat <<'EOF'
feat(activity-ocr): regex patterns for date, amount, section

RE_DATE covers "01 jun 2026" / "1 Jun. 2026". RE_AMOUNT handles
ASCII '+'/'-' and Unicode minus '−' (U+2212, common in iOS OCR
output), plus es-AR thousand/decimal separator format. RE_SECTION
catches "Hoy" / "Ayer" / "Junio 2026". MONTHS_ES is the abbreviated-
to-MM map (es-AR locale).

Tests cover happy paths and several explicit negatives so the regex
intent stays pinned.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Defensive normalize (blocks → Line[])

**Files:**
- Create: `mobile/features/activity-ocr/parser/normalize.ts`
- Test: `tests/unit/activity-ocr-normalize.test.ts`

- [ ] **Step 3.1: Write the failing tests**

Create `tests/unit/activity-ocr-normalize.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalize } from '../../mobile/features/activity-ocr/parser/normalize'

describe('normalize', () => {
  it('flattens block.lines and reads flat frame shape', () => {
    const blocks = [
      {
        lines: [
          { text: 'LA EUROPEA', frame: { top: 100, left: 215, width: 280, height: 60 } },
          { text: '01 jun 2026', frame: { top: 175, left: 215, width: 220, height: 45 } },
        ],
      },
    ]
    const result = normalize(blocks)
    expect(result).toEqual([
      { text: 'LA EUROPEA', frame: { top: 100, left: 215, width: 280, height: 60 } },
      { text: '01 jun 2026', frame: { top: 175, left: 215, width: 220, height: 45 } },
    ])
  })

  it('reads nested boundingBox frame shape', () => {
    const blocks = [
      {
        lines: [
          {
            text: 'LA EUROPEA',
            frame: { boundingBox: { top: 100, left: 215, width: 280, height: 60 } },
          },
        ],
      },
    ]
    const result = normalize(blocks)
    expect(result).toEqual([
      { text: 'LA EUROPEA', frame: { top: 100, left: 215, width: 280, height: 60 } },
    ])
  })

  it('trims whitespace from text', () => {
    const blocks = [
      {
        lines: [
          { text: '  LA EUROPEA  ', frame: { top: 100, left: 215, width: 280, height: 60 } },
        ],
      },
    ]
    const result = normalize(blocks)
    expect(result[0].text).toBe('LA EUROPEA')
  })

  it('skips blocks without a lines array', () => {
    const blocks = [
      { text: 'ignored', frame: { top: 0, left: 0, width: 10, height: 10 } },
      {
        lines: [
          { text: 'kept', frame: { top: 0, left: 0, width: 10, height: 10 } },
        ],
      },
    ]
    const result = normalize(blocks)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('kept')
  })

  it('skips lines with empty text', () => {
    const blocks = [
      {
        lines: [
          { text: '', frame: { top: 0, left: 0, width: 10, height: 10 } },
          { text: '   ', frame: { top: 0, left: 0, width: 10, height: 10 } },
          { text: 'kept', frame: { top: 0, left: 0, width: 10, height: 10 } },
        ],
      },
    ]
    const result = normalize(blocks)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('kept')
  })

  it('skips lines with degenerate frame (width or height 0)', () => {
    const blocks = [
      {
        lines: [
          { text: 'zero-width', frame: { top: 0, left: 0, width: 0, height: 10 } },
          { text: 'zero-height', frame: { top: 0, left: 0, width: 10, height: 0 } },
          { text: 'kept', frame: { top: 0, left: 0, width: 10, height: 10 } },
        ],
      },
    ]
    const result = normalize(blocks)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('kept')
  })

  it('returns empty array for empty input', () => {
    expect(normalize([])).toEqual([])
  })
})
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/activity-ocr-normalize.test.ts`
Expected: FAIL — `Cannot find module .../parser/normalize`.

- [ ] **Step 3.3: Implement normalize**

Create `mobile/features/activity-ocr/parser/normalize.ts`:

```ts
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
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/activity-ocr-normalize.test.ts`
Expected: PASS, 7 tests green.

- [ ] **Step 3.5: Commit**

```bash
git add mobile/features/activity-ocr/parser/normalize.ts tests/unit/activity-ocr-normalize.test.ts
git commit -m "$(cat <<'EOF'
feat(activity-ocr): defensive normalize flattens OCR blocks to Line[]

Reads both flat ({top,left,width,height}) and nested
({boundingBox:{...}}) frame shapes since the exact form depends on
which version of @react-native-ml-kit/text-recognition Phase B
installs. Drops empty text, degenerate frames (width or height 0),
and blocks without a lines array. Pure function with no runtime
dependency on the OCR lib.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: group-rows (Y-clustering)

**Files:**
- Create: `mobile/features/activity-ocr/parser/group-rows.ts`
- Test: `tests/unit/activity-ocr-group-rows.test.ts`

- [ ] **Step 4.1: Write the failing tests**

Create `tests/unit/activity-ocr-group-rows.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { groupRows } from '../../mobile/features/activity-ocr/parser/group-rows'
import type { Line } from '../../mobile/features/activity-ocr/types'

const mk = (text: string, top: number, height = 40, left = 100, width = 200): Line => ({
  text,
  frame: { top, left, width, height },
})

describe('groupRows', () => {
  it('returns empty array for empty input', () => {
    expect(groupRows([])).toEqual([])
  })

  it('puts a single line into a single group', () => {
    const result = groupRows([mk('only', 100)])
    expect(result).toHaveLength(1)
    expect(result[0].lines).toHaveLength(1)
    expect(result[0].top).toBe(100)
  })

  it('groups lines that fit within gapFactor * lineHeight', () => {
    // 2 lines, 5px apart (very close), grouped.
    const result = groupRows([mk('a', 100, 40), mk('b', 145, 40)])
    expect(result).toHaveLength(1)
    expect(result[0].lines.map((l) => l.text)).toEqual(['a', 'b'])
  })

  it('splits lines that are far apart into separate groups', () => {
    // 2 lines, 200px apart (gap >> 1.8 * 40 = 72), separate.
    const result = groupRows([mk('a', 100, 40), mk('b', 340, 40)])
    expect(result).toHaveLength(2)
    expect(result[0].lines[0].text).toBe('a')
    expect(result[1].lines[0].text).toBe('b')
  })

  it('sorts lines by top before grouping', () => {
    const lines = [mk('b', 340, 40), mk('a', 100, 40)]
    const result = groupRows(lines)
    expect(result[0].lines[0].text).toBe('a')
    expect(result[1].lines[0].text).toBe('b')
  })

  it('uses a smaller group.top when later lines extend upward', () => {
    // Same group: two lines, the second physically starts higher (rare but possible).
    const result = groupRows([mk('a', 100, 40), mk('b', 90, 40)])
    expect(result).toHaveLength(1)
    expect(result[0].top).toBe(90)
  })

  it('respects a custom gapFactor', () => {
    // Same input as the split test, but gapFactor 6 keeps them together.
    const result = groupRows([mk('a', 100, 40), mk('b', 340, 40)], 6)
    expect(result).toHaveLength(1)
  })

  it('groups the brief reference layout (2 left + 2 right per row, two rows)', () => {
    const lines: Line[] = [
      mk('LA EUROPEA', 100, 60, 215, 280),
      mk('- 26.000 ARS', 105, 55, 940, 200),
      mk('01 jun 2026', 175, 45, 215, 220),
      // Big visual gap → new transaction.
      mk('USDc → ARS', 350, 60, 215, 280),
      mk('- 16 USDc', 355, 55, 940, 200),
      mk('01 jun 2026', 425, 45, 215, 220),
      mk('+ 23.697,71 ARS', 430, 50, 850, 300),
    ]
    const result = groupRows(lines)
    expect(result).toHaveLength(2)
    expect(result[0].lines.map((l) => l.text)).toContain('LA EUROPEA')
    expect(result[0].lines.map((l) => l.text)).toContain('01 jun 2026')
    expect(result[1].lines.map((l) => l.text)).toContain('USDc → ARS')
    expect(result[1].lines.map((l) => l.text)).toContain('+ 23.697,71 ARS')
  })
})
```

- [ ] **Step 4.2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/activity-ocr-group-rows.test.ts`
Expected: FAIL — `Cannot find module .../parser/group-rows`.

- [ ] **Step 4.3: Implement group-rows**

Create `mobile/features/activity-ocr/parser/group-rows.ts`:

```ts
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
```

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/activity-ocr-group-rows.test.ts`
Expected: PASS, 8 tests green.

- [ ] **Step 4.5: Commit**

```bash
git add mobile/features/activity-ocr/parser/group-rows.ts tests/unit/activity-ocr-group-rows.test.ts
git commit -m "$(cat <<'EOF'
feat(activity-ocr): groupRows clusters lines by vertical gap

A gap > gapFactor * lineHeight starts a new TransactionGroup. The
threshold is proportional so the same code works at multiple
resolutions and densities. Default gapFactor 1.8 calibrated for the
brief reference screenshot; callers can override per source app.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: classify (group → Transaction | null)

**Files:**
- Create: `mobile/features/activity-ocr/parser/classify.ts`
- Test: `tests/unit/activity-ocr-classify.test.ts`

- [ ] **Step 5.1: Write the failing tests**

Create `tests/unit/activity-ocr-classify.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { classify } from '../../mobile/features/activity-ocr/parser/classify'
import type { TransactionGroup } from '../../mobile/features/activity-ocr/types'

const IMAGE_WIDTH = 1206

const mkGroup = (
  lines: Array<{ text: string; top: number; left: number; width?: number; height?: number }>,
): TransactionGroup => ({
  top: Math.min(...lines.map((l) => l.top)),
  lines: lines.map((l) => ({
    text: l.text,
    frame: { top: l.top, left: l.left, width: l.width ?? 200, height: l.height ?? 50 },
  })),
})

describe('classify — simple egreso', () => {
  it('parses LA EUROPEA / - 26.000 ARS', () => {
    const group = mkGroup([
      { text: 'LA EUROPEA', top: 100, left: 215, width: 280, height: 60 },
      { text: '01 jun 2026', top: 175, left: 215, width: 220, height: 45 },
      { text: '- 26.000 ARS', top: 105, left: 940, width: 200, height: 55 },
    ])
    const tx = classify(group, IMAGE_WIDTH)
    expect(tx).not.toBeNull()
    expect(tx!.merchant).toBe('LA EUROPEA')
    expect(tx!.date).toBe('2026-06-01')
    expect(tx!.section).toBeNull()
    expect(tx!.primaryAmount).toEqual({ value: 26000, currency: 'ARS', sign: -1 })
    expect(tx!.secondaryAmount).toBeNull()
    expect(tx!.raw).toBe('LA EUROPEA 01 jun 2026 - 26.000 ARS')
  })
})

describe('classify — swap doble monto', () => {
  it('captures both primary and secondary amounts in vertical order', () => {
    const group = mkGroup([
      { text: 'USDc → ARS', top: 230, left: 215, width: 280, height: 60 },
      { text: '01 jun 2026', top: 305, left: 215, width: 220, height: 45 },
      { text: '- 16 USDc', top: 235, left: 940, width: 200, height: 55 },
      { text: '+ 23.697,71 ARS', top: 310, left: 850, width: 300, height: 50 },
    ])
    const tx = classify(group, IMAGE_WIDTH)
    expect(tx).not.toBeNull()
    expect(tx!.merchant).toBe('USDc → ARS')
    expect(tx!.primaryAmount).toEqual({ value: 16, currency: 'USDc', sign: -1 })
    expect(tx!.secondaryAmount).toEqual({ value: 23697.71, currency: 'ARS', sign: 1 })
  })
})

describe('classify — ingreso con decimal', () => {
  it('parses Cashback / + 15,49 USDc', () => {
    const group = mkGroup([
      { text: 'Cashback', top: 450, left: 215, width: 200, height: 60 },
      { text: '01 jun 2026', top: 525, left: 215, width: 220, height: 45 },
      { text: '+ 15,49 USDc', top: 455, left: 940, width: 220, height: 55 },
    ])
    const tx = classify(group, IMAGE_WIDTH)
    expect(tx).not.toBeNull()
    expect(tx!.merchant).toBe('Cashback')
    expect(tx!.primaryAmount).toEqual({ value: 15.49, currency: 'USDc', sign: 1 })
  })
})

describe('classify — miles con punto', () => {
  it('parses "- 110.000 ARS" as 110000, not 110', () => {
    const group = mkGroup([
      { text: 'A RASCHI SANTIAGO', top: 600, left: 215, width: 320, height: 60 },
      { text: '01 jun 2026', top: 675, left: 215, width: 220, height: 45 },
      { text: '- 110.000 ARS', top: 605, left: 940, width: 220, height: 55 },
    ])
    const tx = classify(group, IMAGE_WIDTH)
    expect(tx).not.toBeNull()
    expect(tx!.primaryAmount.value).toBe(110000)
  })
})

describe('classify — sin monto reconocible', () => {
  it('returns null when no amount in the right column', () => {
    const group = mkGroup([
      { text: 'Hoy', top: 50, left: 100, width: 200, height: 50 },
    ])
    expect(classify(group, IMAGE_WIDTH)).toBeNull()
  })
})

describe('classify — Unicode minus', () => {
  it('treats "−" (U+2212) as negative sign', () => {
    const group = mkGroup([
      { text: 'TEST', top: 100, left: 215, width: 280, height: 60 },
      { text: '01 jun 2026', top: 175, left: 215, width: 220, height: 45 },
      { text: '− 50 USDc', top: 105, left: 940, width: 200, height: 55 },
    ])
    const tx = classify(group, IMAGE_WIDTH)
    expect(tx).not.toBeNull()
    expect(tx!.primaryAmount.sign).toBe(-1)
    expect(tx!.primaryAmount.value).toBe(50)
  })
})

describe('classify — column divider', () => {
  it('uses imageWidth * 0.5 as default divider', () => {
    // merchant at left 580 (just under 603 = 1206 * 0.5) → left column.
    const group = mkGroup([
      { text: 'BORDERLINE', top: 100, left: 580, width: 100, height: 60 },
      { text: '- 100 ARS', top: 100, left: 700, width: 100, height: 60 },
    ])
    const tx = classify(group, IMAGE_WIDTH)
    expect(tx!.merchant).toBe('BORDERLINE')
    expect(tx!.primaryAmount.value).toBe(100)
  })

  it('honors a custom columnDividerRatio', () => {
    // With ratio 0.7, divider is at 844 (instead of 603), so merchant at 700 is still left.
    const group = mkGroup([
      { text: 'WIDER LEFT', top: 100, left: 700, width: 100, height: 60 },
      { text: '- 100 ARS', top: 100, left: 900, width: 100, height: 60 },
    ])
    const tx = classify(group, IMAGE_WIDTH, 0.7)
    expect(tx!.merchant).toBe('WIDER LEFT')
    expect(tx!.primaryAmount.value).toBe(100)
  })
})
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/activity-ocr-classify.test.ts`
Expected: FAIL — `Cannot find module .../parser/classify`.

- [ ] **Step 5.3: Implement classify**

Create `mobile/features/activity-ocr/parser/classify.ts`:

```ts
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
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/activity-ocr-classify.test.ts`
Expected: PASS, all assertions green (10 tests across 7 describe blocks).

- [ ] **Step 5.5: Commit**

```bash
git add mobile/features/activity-ocr/parser/classify.ts tests/unit/activity-ocr-classify.test.ts
git commit -m "$(cat <<'EOF'
feat(activity-ocr): classify TransactionGroup → Transaction | null

Splits each group by X (default mid-image divider), picks date and
merchant from the left column, and parses amounts from the right
column in vertical order (top = primary, second = secondary for
swap-style rows). Normalizes es-AR thousand/decimal separators to
JS numbers. Returns null when no parseable amount is found so the
orchestrator can route the group to unmatched (section headers,
noise, untested layouts).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: parse-activity-lines orchestrator

**Files:**
- Create: `mobile/features/activity-ocr/parse-activity-lines.ts`
- Test: `tests/unit/activity-ocr-parse-lines.test.ts`

- [ ] **Step 6.1: Write the failing tests**

Create `tests/unit/activity-ocr-parse-lines.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseActivityLines } from '../../mobile/features/activity-ocr/parse-activity-lines'
import type { Line } from '../../mobile/features/activity-ocr/types'

const IMAGE_WIDTH = 1206

const mk = (text: string, top: number, left: number, width: number, height: number): Line => ({
  text,
  frame: { top, left, width, height },
})

describe('parseActivityLines — empty / invalid input', () => {
  it('returns empty result for empty lines', () => {
    expect(parseActivityLines([], IMAGE_WIDTH)).toEqual({ transactions: [], unmatched: [] })
  })

  it('returns empty result for non-positive imageWidth without throwing', () => {
    const lines: Line[] = [mk('LA EUROPEA', 100, 215, 280, 60)]
    expect(parseActivityLines(lines, 0)).toEqual({ transactions: [], unmatched: [] })
    expect(parseActivityLines(lines, -5)).toEqual({ transactions: [], unmatched: [] })
  })
})

describe('parseActivityLines — reference capture (4 transactions)', () => {
  it('produces the 4 transactions from the brief reference screenshot', () => {
    const lines: Line[] = [
      // tx 1: LA EUROPEA
      mk('LA EUROPEA', 100, 215, 280, 60),
      mk('01 jun 2026', 175, 215, 220, 45),
      mk('- 26.000 ARS', 105, 940, 200, 55),
      // tx 2: USDc → ARS swap
      mk('USDc → ARS', 350, 215, 280, 60),
      mk('01 jun 2026', 425, 215, 220, 45),
      mk('- 16 USDc', 355, 940, 200, 55),
      mk('+ 23.697,71 ARS', 430, 850, 300, 50),
      // tx 3: Cashback
      mk('Cashback', 600, 215, 200, 60),
      mk('01 jun 2026', 675, 215, 220, 45),
      mk('+ 15,49 USDc', 605, 940, 220, 55),
      // tx 4: A RASCHI SANTIAGO
      mk('A RASCHI SANTIAGO', 850, 215, 320, 60),
      mk('01 jun 2026', 925, 215, 220, 45),
      mk('- 110.000 ARS', 855, 940, 220, 55),
    ]

    const result = parseActivityLines(lines, IMAGE_WIDTH)
    expect(result.unmatched).toEqual([])
    expect(result.transactions).toHaveLength(4)

    expect(result.transactions[0]).toMatchObject({
      merchant: 'LA EUROPEA',
      date: '2026-06-01',
      section: null,
      primaryAmount: { value: 26000, currency: 'ARS', sign: -1 },
      secondaryAmount: null,
    })

    expect(result.transactions[1]).toMatchObject({
      merchant: 'USDc → ARS',
      date: '2026-06-01',
      section: null,
      primaryAmount: { value: 16, currency: 'USDc', sign: -1 },
      secondaryAmount: { value: 23697.71, currency: 'ARS', sign: 1 },
    })

    expect(result.transactions[2]).toMatchObject({
      merchant: 'Cashback',
      date: '2026-06-01',
      primaryAmount: { value: 15.49, currency: 'USDc', sign: 1 },
    })

    expect(result.transactions[3]).toMatchObject({
      merchant: 'A RASCHI SANTIAGO',
      date: '2026-06-01',
      primaryAmount: { value: 110000, currency: 'ARS', sign: -1 },
    })
  })
})

describe('parseActivityLines — section inheritance', () => {
  it('inherits a section header into following transactions', () => {
    const lines: Line[] = [
      mk('Hoy', 40, 100, 100, 40),
      // tx under "Hoy"
      mk('LA EUROPEA', 200, 215, 280, 60),
      mk('01 jun 2026', 275, 215, 220, 45),
      mk('- 26.000 ARS', 205, 940, 200, 55),
    ]
    const result = parseActivityLines(lines, IMAGE_WIDTH)
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0].section).toBe('Hoy')
  })

  it('switches section when a new header appears mid-list', () => {
    const lines: Line[] = [
      mk('Hoy', 40, 100, 100, 40),
      // tx 1 under Hoy
      mk('A', 200, 215, 100, 60),
      mk('01 jun 2026', 275, 215, 220, 45),
      mk('- 10 ARS', 205, 940, 200, 55),
      // new section
      mk('Ayer', 500, 100, 100, 40),
      // tx 2 under Ayer
      mk('B', 700, 215, 100, 60),
      mk('31 may 2026', 775, 215, 220, 45),
      mk('- 20 ARS', 705, 940, 200, 55),
    ]
    const result = parseActivityLines(lines, IMAGE_WIDTH)
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0].section).toBe('Hoy')
    expect(result.transactions[1].section).toBe('Ayer')
  })
})

describe('parseActivityLines — unmatched', () => {
  it('routes groups without a parseable amount into unmatched', () => {
    const lines: Line[] = [
      // No amount on the right → unmatched (not a section header either).
      mk('something weird', 100, 215, 280, 60),
      mk('01 jun 2026', 175, 215, 220, 45),
    ]
    const result = parseActivityLines(lines, IMAGE_WIDTH)
    expect(result.transactions).toEqual([])
    expect(result.unmatched).toHaveLength(1)
  })
})
```

- [ ] **Step 6.2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/activity-ocr-parse-lines.test.ts`
Expected: FAIL — `Cannot find module .../parse-activity-lines`.

- [ ] **Step 6.3: Implement parse-activity-lines**

Create `mobile/features/activity-ocr/parse-activity-lines.ts`:

```ts
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
```

- [ ] **Step 6.4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/activity-ocr-parse-lines.test.ts`
Expected: PASS — all tests green including the 4-transaction reference fixture.

- [ ] **Step 6.5: Commit**

```bash
git add mobile/features/activity-ocr/parse-activity-lines.ts tests/unit/activity-ocr-parse-lines.test.ts
git commit -m "$(cat <<'EOF'
feat(activity-ocr): parseActivityLines orchestrator + reference test

Groups lines by Y, sorts groups top-down, walks through them
inheriting section headers (Hoy/Ayer/<Mes Año>) into subsequent
transactions, and routes uncategorizable groups to unmatched.
Pure: takes Line[] + imageWidth, returns ParseResult — no OCR
dependency. The reference test asserts the 4-transaction layout
from the brief screenshot end-to-end (including the swap with
secondaryAmount).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Public URI stub

**Files:**
- Create: `mobile/features/activity-ocr/activity-parser.ts`

No test needed: this is a deliberate runtime stub for Phase A. A test would only verify it throws, which is low value.

- [ ] **Step 7.1: Create the stub**

Create `mobile/features/activity-ocr/activity-parser.ts`:

```ts
import type { ParseResult } from './types'

/**
 * Public end-to-end API: uri → ParseResult.
 *
 * STUB in Phase A — the implementation lives in Phase B once
 * @react-native-ml-kit/text-recognition + expo-image-picker are
 * installed and the dev build can run ML Kit on-device.
 *
 * For Phase-A-style isolated tests of the parser logic, call
 * `parseActivityLines(lines, imageWidth)` directly with a fixture.
 */
export async function parseActivity(_uri: string): Promise<ParseResult> {
  throw new Error(
    'parseActivity requires Phase B (ML Kit wiring). Use parseActivityLines for unit tests.',
  )
}
```

- [ ] **Step 7.2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7.3: Commit**

```bash
git add mobile/features/activity-ocr/activity-parser.ts
git commit -m "$(cat <<'EOF'
feat(activity-ocr): parseActivity URI stub (Phase B will wire ML Kit)

The public uri-based entry point that the rest of the app would
import lives here, but throws in Phase A. Phase B replaces the body
with: recognizeBlocks(uri) → normalize → getImageWidth(uri) →
parseActivityLines. Leaving the stub now keeps the import path
stable so the eventual UI/persistence layers reference the final
location from day one.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Full validate gate

**Files:** none modified.

- [ ] **Step 8.1: Run full validate**

Run: `npm run validate`
Expected: typecheck + lint + vitest (now including the 5 new test files) + guards (legacy-spacing, forbidden-copy, motion-tokens) all pass. The new test files should add ~35+ new passing tests; baseline pre-existing failures stay unchanged per `[[feedback-vitest-no-react-renderer]]`.

If any check fails, fix it in a new commit, then re-run.

- [ ] **Step 8.2: Confirm zero deps added**

Run: `git diff origin/feature/activity-ocr HEAD -- package.json package-lock.json`
Expected: empty output. Phase A introduces zero runtime or dev dependencies.

- [ ] **Step 8.3: Confirm zero docs drift**

Run: `git status` from the repo root.
Expected: nothing to commit. The spec already documents the design; no additional docs needed for Phase A (the post-ship doc waits until Phase A is complete and validated).

- [ ] **Step 8.4: Push the branch**

Run: `git push origin feature/activity-ocr`
Expected: push succeeds. Remote branch now has the spec + 6 implementation commits + validate confirmation.

---

## Self-Review

**1. Spec coverage:** Walked the spec sections:
- Types contract → Task 1 ✓
- `patterns.ts` (RE_DATE, RE_AMOUNT, RE_SECTION, MONTHS_ES) → Task 2 ✓
- `normalize.ts` defensive frame-shape handling → Task 3 ✓
- `group-rows.ts` Y-clustering with `gapFactor` → Task 4 ✓
- `classify.ts` column split + regex + parseAmount es-AR + toISO → Task 5 ✓
- `parse-activity-lines.ts` orchestrator with section inheritance → Task 6 ✓
- `activity-parser.ts` stub → Task 7 ✓
- Test coverage (5 test files matching spec §"Testing") → Tasks 2–6 ✓
- Reference screenshot 4-transaction fixture → Task 6 end-to-end ✓
- Out-of-scope items (ML Kit, DB, UI, dedup, categorization) — explicitly NOT in any task ✓

**2. Placeholder scan:** No "TBD", "TODO", "handle edge cases", or "similar to Task N" anywhere. Every step has concrete code or commands with expected output.

**3. Type consistency:**
- `Frame { top, left, width, height }` consistent across normalize, group-rows, classify, parse-lines.
- `Line { text, frame: Frame }` consistent.
- `TransactionGroup { lines, top }` consistent.
- `Amount { value, currency, sign }` consistent.
- `Sign = 1 | -1` consistent.
- `Transaction` consistent.
- `ParseResult { transactions, unmatched }` consistent.
- `groupRows(lines, gapFactor?)` signature stable across Tasks 4 and 6.
- `classify(group, imageWidth, columnDividerRatio?)` signature stable across Tasks 5 and 6.
- `parseActivityLines(lines, imageWidth, options?)` signature stable in Task 6 and would be stable in Task 7 if the stub used it.

**4. Project memory respected:**
- Vitest env `node`, no React renderer → all tests are pure ts imports of pure modules. ✓ (`[[feedback-vitest-no-react-renderer]]`)
- No Reanimated worklets in this work, so the `Easing`/`Intl`/runOnJS memories don't apply.
- No deps added → bundle pre-flight per `[[feedback-validate-is-not-bundle]]` not strictly required, but the validate gate covers typecheck + lint + tests. Bundle pre-flight matters when adding native deps (Phase B will need it).
- Branch policy: work stays on `feature/activity-ocr`, no merge to main this phase. ✓
