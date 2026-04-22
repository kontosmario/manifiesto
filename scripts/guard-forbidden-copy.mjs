#!/usr/bin/env node
/**
 * Fails CI when forbidden UI strings appear in app/mobile source.
 * Allowlist: prefix a line with `// @copy-allow` to skip.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(process.cwd())
const scanRoots = ['mobile', 'app'].map((d) => join(root, d))

const FORBIDDEN_PATTERNS = [
  {
    pattern: /['"]Cargando\.\.\.['"]|['"]Cargando…['"]/,
    hint: "Use loadingLabels.<key> from '@/lib/copy/states'",
  },
  {
    pattern: /['"]Sin datos['"]/,
    hint: "Use emptyStates.<key> from '@/lib/copy/states'",
  },
  {
    pattern: /['"]No hay registros['"]/,
    hint: "Use emptyStates.<key> from '@/lib/copy/states'",
  },
]

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
    scanFile(path)
  }
}

function scanFile(path) {
  const content = readFileSync(path, 'utf8')
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.includes('@copy-allow')) continue
    for (const { pattern, hint } of FORBIDDEN_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({
          file: relative(root, path),
          line: i + 1,
          content: line.trim(),
          hint,
        })
      }
    }
  }
}

for (const dir of scanRoots) {
  walk(dir)
}

if (violations.length > 0) {
  console.error('\nForbidden UI copy detected:\n')
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`)
    console.error(`    ${v.content}`)
    console.error(`    → ${v.hint}\n`)
  }
  process.exit(1)
}

process.exit(0)
