#!/usr/bin/env node
/**
 * Verifica que cada key referenciada por t('ns:key') / i18n.t('ns:key') en el
 * código exista en el bundle de locales (es). Caza referencias rotas (typos,
 * namespace equivocado) que en runtime se verían como "ns:key" crudo.
 *
 * Limitaciones: solo keys ESTÁTICAS (string literal). Las dinámicas
 * (t(`ns:${x}`)) se cuentan aparte y NO se validan.
 *
 * Uso: node scripts/check-i18n-keys.mjs   (exit 1 si hay keys faltantes)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const MOBILE = join(ROOT, 'mobile')
const LOCALES = join(MOBILE, 'lib/i18n/locales/es')
const DEFAULT_NS = 'common'

// --- cargar bundle es: ns -> Set de paths dot-joined ---
const nsKeys = new Map()
for (const f of readdirSync(LOCALES).filter((x) => x.endsWith('.json'))) {
  const ns = f.replace('.json', '')
  const json = JSON.parse(readFileSync(join(LOCALES, f), 'utf8'))
  const set = new Set()
  const walk = (o, p = '') => {
    for (const k in o) {
      const key = p ? `${p}.${k}` : k
      const v = o[k]
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, key)
      else set.add(key)
    }
  }
  walk(json)
  nsKeys.set(ns, set)
}

// una key usada es válida si: existe exacta, o existe alguna `${key}_<suf>`
// (cubre plurales _one/_other y context _loss/_gain/etc.)
function keyExists(ns, path) {
  const set = nsKeys.get(ns)
  if (!set) return false
  if (set.has(path)) return true
  for (const k of set) if (k.startsWith(path + '_')) return true
  return false
}

// --- recolectar archivos ---
const files = []
const skipDirs = new Set(['node_modules', 'lib/i18n'])
function walkDir(dir) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e)
    const rel = full.slice(MOBILE.length + 1)
    if (skipDirs.has(e) || rel.startsWith('lib/i18n')) continue
    const st = statSync(full)
    if (st.isDirectory()) walkDir(full)
    else if (/\.(ts|tsx)$/.test(e)) files.push(full)
  }
}
walkDir(MOBILE)

// --- extraer llamadas t('...') / i18n.t('...') con literal ---
const STATIC = /(?<![A-Za-z0-9_$])(?:i18n\.)?t\(\s*(['"])([^'"]+?)\1/g
const DYNAMIC = /(?<![A-Za-z0-9_$])(?:i18n\.)?t\(\s*`/g

const missing = []
let usedStatic = 0
let dynamicCount = 0
function stripComments(s) {
  // quita block /* */ y line // comments para no matchear t('...') citado en docs.
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

for (const file of files) {
  const src = stripComments(readFileSync(file, 'utf8'))
  let m
  while ((m = STATIC.exec(src))) {
    const raw = m[2]
    // ignorar cosas que claramente no son keys (urls, espacios, formato)
    if (raw.includes(' ') || raw.startsWith('http') || raw.startsWith('/')) continue
    usedStatic++
    let ns = DEFAULT_NS
    let path = raw
    if (raw.includes(':')) {
      const idx = raw.indexOf(':')
      ns = raw.slice(0, idx)
      path = raw.slice(idx + 1)
    }
    if (!nsKeys.has(ns)) continue // probablemente no es una key i18n (otro t())
    if (!keyExists(ns, path)) {
      missing.push({ file: file.slice(ROOT.length), key: `${ns}:${path}` })
    }
  }
  const dm = src.match(DYNAMIC)
  if (dm) dynamicCount += dm.length
}

console.log(`Archivos escaneados: ${files.length}`)
console.log(`Llamadas t() estáticas validadas: ${usedStatic}`)
console.log(`Llamadas t() dinámicas (no validables): ${dynamicCount}`)
console.log(`Keys faltantes: ${missing.length}`)
if (missing.length) {
  console.log('\n--- FALTANTES (key referenciada que NO existe en es bundle) ---')
  for (const x of missing) console.log(`  ${x.file}  →  ${x.key}`)
  process.exit(1)
}
console.log('OK: todas las keys estáticas resuelven.')
