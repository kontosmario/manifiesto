#!/usr/bin/env node
/**
 * Fails CI when an animation in mobile/ source uses inline numeric
 * spring or timing configs instead of consuming the centralized
 * motion vocabulary in `mobile/lib/motion/tokens.ts`.
 *
 * Why this matters: every drift from the tokens turns "the app's
 * motion language" into "this screen's motion language". The
 * `add-quick-actions-overlay` audit (2026-05-03) caught a fan menu
 * that had grown its own spring config inline; this guard would
 * have flagged it on the first commit.
 *
 * What's checked:
 *   1. `withSpring(value, { damping: <number>, ... })` — inline
 *      spring config. Must reference `motionSprings.X` instead.
 *   2. `withTiming(value, { duration: <number>, ... })` — inline
 *      timing duration. Must reference `motionDurations.X` (or
 *      `decorativeDurations.X` for loops).
 *
 * Allowlist: prefix the offending line (or the line above) with
 *   // @motion-allow: <reason>
 * for legitimate one-offs (e.g. per-frame physics in a gesture).
 *
 * Excluded files:
 *   - mobile/lib/motion/tokens.ts (the vocabulary itself)
 *   - *.test.ts(x) and *.spec.ts(x)
 *   - node_modules / dist
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(process.cwd())
const scanRoot = join(root, 'mobile')
const TOKENS_FILE = join(root, 'mobile/lib/motion/tokens.ts')
const BASELINE_FILE = join(root, 'scripts/motion-tokens-baseline.json')

// Files in the baseline are legacy — they shipped inline configs
// before the guard existed and migrate incrementally. The baseline
// snapshots the violation COUNT per file (or, in legacy format, just
// the file list). A file in the baseline is allowed to keep its
// existing count of violations, but if its count grows, the new
// violations are blocking. Drain the list by migrating callsites to
// motion tokens and reducing each count toward 0.
let baselineCounts = new Map()
try {
  const raw = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
  if (raw.counts && typeof raw.counts === 'object') {
    // New count-based format: { "path/to/file.tsx": 5, ... }
    baselineCounts = new Map(Object.entries(raw.counts))
  } else if (Array.isArray(raw.allowlist)) {
    // Legacy format: array of file paths grandfathered with no cap.
    // Map each to Infinity so they don't block during migration to
    // the new format. Update the JSON to use `counts` to enable
    // regression detection.
    for (const file of raw.allowlist) {
      baselineCounts.set(file, Number.POSITIVE_INFINITY)
    }
  }
} catch {
  // Baseline missing — treat every violation as new.
}

// Match `withSpring(` ... `{` ... `damping:` (across newlines).
// The lookahead-style match is approximated by scanning a small
// window after each `withSpring(` occurrence — regex with /s would
// also work but we want line-accurate reporting.
const SPRING_INLINE = /withSpring\s*\(/g
const TIMING_INLINE = /withTiming\s*\(/g
const ALLOW_COMMENT = /\/\/\s*@motion-allow/

function isExcluded(path) {
  if (path === TOKENS_FILE) return true
  if (/\.(test|spec)\.tsx?$/.test(path)) return true
  if (path.includes('/node_modules/')) return true
  if (path.includes('/dist/')) return true
  return false
}

const violations = []

function walk(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    if (entry === 'node_modules' || entry === 'dist') continue
    const path = join(dir, entry)
    const stats = statSync(path)
    if (stats.isDirectory()) {
      walk(path)
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue
    if (entry.endsWith('.d.ts')) continue
    if (isExcluded(path)) continue
    scanFile(path)
  }
}

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length
}

function isAllowedAt(content, byteIndex) {
  // Allow if the offending line OR the line above contains
  // `// @motion-allow`.
  const lines = content.split('\n')
  const line = lineOf(content, byteIndex) - 1 // zero-indexed
  if (lines[line] && ALLOW_COMMENT.test(lines[line])) return true
  if (line > 0 && lines[line - 1] && ALLOW_COMMENT.test(lines[line - 1])) return true
  return false
}

function findInlineConfig(content, callRegex, configKey) {
  // For each match of the call regex, peek up to the next 400 chars
  // for an opening `{` followed by `<configKey>: <number>` before
  // the matching `)`. We use a balanced-paren scan to find the
  // call's closing `)`, then look inside that slice.
  const results = []
  callRegex.lastIndex = 0
  let m
  while ((m = callRegex.exec(content)) !== null) {
    const callStart = m.index
    const openParen = callStart + m[0].length - 1
    // Walk forward to find balanced closing paren.
    let depth = 1
    let i = openParen + 1
    let inString = null
    while (i < content.length && depth > 0) {
      const c = content[i]
      if (inString) {
        if (c === '\\') {
          i += 2
          continue
        }
        if (c === inString) inString = null
        i++
        continue
      }
      if (c === '"' || c === "'" || c === '`') {
        inString = c
        i++
        continue
      }
      if (c === '(') depth++
      else if (c === ')') depth--
      i++
    }
    const callSlice = content.slice(openParen + 1, i - 1)
    // Look for `{ ... <configKey>: <number> ... }` inside the call.
    const inline = new RegExp(`\\{[^{}]*\\b${configKey}\\s*:\\s*-?\\d`, 's')
    if (inline.test(callSlice)) {
      if (!isAllowedAt(content, callStart)) {
        results.push({ index: callStart, line: lineOf(content, callStart) })
      }
    }
  }
  return results
}

function scanFile(path) {
  const content = readFileSync(path, 'utf8')
  const rel = relative(root, path)

  // 1. Inline spring configs — anything like `{ damping: 14, ... }`
  for (const v of findInlineConfig(content, SPRING_INLINE, 'damping')) {
    violations.push({
      file: rel,
      line: v.line,
      kind: 'inline-spring',
      hint: 'Replace inline { damping, stiffness, mass } with `motionSprings.<key>` from `@/lib/motion/tokens`. Add a new key there if no existing spring fits.',
    })
  }

  // 2. Inline timing durations — `{ duration: 200, ... }`
  for (const v of findInlineConfig(content, TIMING_INLINE, 'duration')) {
    violations.push({
      file: rel,
      line: v.line,
      kind: 'inline-timing',
      hint: 'Replace inline { duration: <number> } with `{ duration: motionDurations.<key> }` (or `decorativeDurations.<key>` for loops) from `@/lib/motion/tokens`.',
    })
  }
}

walk(scanRoot)

// Per-file counts of violations in the current run. Used to detect
// when a baseline file has more violations than its baseline cap.
const currentCounts = new Map()
for (const v of violations) {
  currentCounts.set(v.file, (currentCounts.get(v.file) ?? 0) + 1)
}

const blocking = []
const legacy = []
const regressedFiles = []
for (const v of violations) {
  const cap = baselineCounts.get(v.file)
  if (cap === undefined) {
    blocking.push(v)
    continue
  }
  // File is in baseline. Allowed up to `cap` violations. If current
  // count exceeds cap, the excess violations are blocking.
  const current = currentCounts.get(v.file) ?? 0
  if (current > cap) {
    if (!regressedFiles.includes(v.file)) {
      regressedFiles.push(v.file)
    }
    blocking.push(v)
  } else {
    legacy.push(v)
  }
}

if (blocking.length === 0) {
  if (legacy.length === 0) {
    console.log('motion-tokens guard: 0 violations.')
  } else {
    console.log(
      `motion-tokens guard: 0 new violations. ${legacy.length} legacy violation(s) in baseline files (not blocking).`,
    )
  }
  process.exit(0)
}

console.error(
  `motion-tokens guard: ${blocking.length} blocking violation(s) (${legacy.length} legacy in baseline).\n`,
)
if (regressedFiles.length > 0) {
  console.error(
    `Files in the baseline that regressed (current count > baseline cap):`,
  )
  for (const file of regressedFiles) {
    const cap = baselineCounts.get(file)
    const current = currentCounts.get(file) ?? 0
    console.error(`  ${file}: ${current} now / ${cap} baseline`)
  }
  console.error('')
}
for (const v of blocking) {
  console.error(`  ${v.file}:${v.line}  [${v.kind}]`)
  console.error(`    ${v.hint}`)
  console.error(`    To allow this one-off, add  // @motion-allow: <reason>  on the call site.`)
  console.error(
    `    To grandfather the whole file, bump its count in scripts/motion-tokens-baseline.json (requires reviewer approval).\n`,
  )
}
process.exit(1)
