#!/usr/bin/env node
/**
 * Detecta copy USER-FACING en español todavía hardcodeado (no envuelto en t()).
 * Es el gate de "100% coverage" de la i18n. Heurístico pero conservador:
 * solo marca strings con señal fuerte de español (diacríticos/¿¡ o ≥2 stopwords
 * españolas) en (a) JSX text nodes y (b) props user-facing / Alert.alert.
 *
 * Markers para silenciar un falso positivo legítimo: comentario `@i18n-ignore`
 * en la misma línea.
 *
 * Uso: node scripts/check-i18n-hardcoded.mjs  (exit 1 si hay hits de alta confianza)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const MOBILE = join(ROOT, 'mobile')

const PROP = /\b(title|label|placeholder|description|message|subtitle|heading|hint|eyebrow|footer|cta|accessibilityLabel|accessibilityHint|confirmText|cancelText|emptyTitle|emptyDescription)\s*[=:]\s*(['"])([^'"]{3,})\2/g
const ALERT = /Alert\.alert\(\s*(['"])([^'"]{3,})\1\s*(?:,\s*(['"])([^'"]{3,})\3)?/g
const JSXTEXT = />\s*([A-Za-zÁÉÍÓÚáéíóúñ¿¡][^<>{}\n]{2,})</g

const DIACRITIC = /[áéíóúÁÉÍÓÚñ¿¡]/
const STOPWORDS = /\b(el|la|los|las|un|una|unos|unas|tu|tus|su|sus|de|del|para|con|por|sin|que|más|días|día|cuenta|gasto|gastos|hogar|ahorro|saldo|cobro|meta|ingreso|aporte|aún|está|esta|este|tus|vas|hacé|para|cuando|todavía|registra|elegí|guardar|cancelar|volver)\b/gi
// excluí cosas técnicas obvias
const TECHY = /^[a-z0-9-]+$|^#[0-9a-fA-F]{3,8}$|^https?:|^\/|^[A-Z_]+$|^\d/

// endónimos de idioma: nunca se traducen (se muestran en su propia lengua)
const ENDONYM = new Set(['Español', 'English', 'Português', 'Inglés'])

function looksSpanish(s) {
  if (ENDONYM.has(s.trim())) return null
  if (DIACRITIC.test(s)) return 'diacritic'
  const m = s.match(STOPWORDS)
  if (m && m.length >= 2) return 'stopwords'
  return null
}

// Allowlist explícito: archivos/dirs que NO son copy de producción user-facing
// (preview de dev, fixtures __DEV__, data mock, dead code). Decisión auditable
// en vez de markers dispersos. Si algo de acá se cablea a UI real, sacarlo.
const ALLOWLIST = [
  'components/control-hero-preview/', // preview de dev (solo el TYPE se usa en prod)
  'screens/dev/', // pantallas dev (__DEV__)
  'screens/dev-health-screen', // pantalla dev
  'features/insights/assistant-demo-signals.ts', // "Modo demo del asistente" (__DEV__)
  'features/insights/control-v2-mock.ts', // fixture mock, nunca servido a usuarios reales
  'features/insights/control-metric-groups.ts', // dead code (sin consumidores)
  'features/import-review/preview-mock-state.ts', // data mock (comercios de ejemplo)
  'features/flags/feature-flag-keys.ts', // descripciones de flags dev
]
const allowlisted = (rel) => ALLOWLIST.some((p) => rel.includes(p))

const files = []
function walk(dir) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e)
    const rel = full.slice(MOBILE.length + 1)
    if (e === 'node_modules' || rel.startsWith('lib/i18n')) continue
    if (/\.test\.|__tests__/.test(rel)) continue
    const st = statSync(full)
    if (st.isDirectory()) walk(full)
    else if (/\.(ts|tsx)$/.test(e) && !allowlisted(rel)) files.push(full)
  }
}
walk(MOBILE)

const hits = []
for (const file of files) {
  const raw = readFileSync(file, 'utf8')
  const rawLines = raw.split('\n')
  // skip de archivo entero: directiva @i18n-ignore-file, o un @i18n-ignore en
  // el header (primeras 12 líneas) → fixture/dev/dead-code documentado.
  const header = rawLines.slice(0, 12).join('\n')
  if (/@i18n-ignore-file|@i18n-ignore/.test(header)) continue
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const check = (text, kind) => {
    if (!text) return
    const t = text.trim()
    if (TECHY.test(t)) return
    const why = looksSpanish(t)
    if (!why) return
    // línea en el source CRUDO. Honra @i18n-ignore en la misma línea o hasta
    // 2 líneas arriba (convención: marker en el comentario sobre la propiedad).
    const idx = raw.indexOf(t)
    const line = idx >= 0 ? raw.slice(0, idx).split('\n').length : 0
    if (line) {
      for (let i = line - 1; i >= Math.max(0, line - 3); i--) {
        if (rawLines[i] && rawLines[i].includes('@i18n-ignore')) return
      }
    }
    hits.push({ file: file.slice(ROOT.length), line, kind, why, text: t.slice(0, 70) })
  }
  let m
  while ((m = PROP.exec(src))) check(m[3], 'prop:' + m[1])
  while ((m = ALERT.exec(src))) { check(m[2], 'alert'); if (m[4]) check(m[4], 'alert') }
  while ((m = JSXTEXT.exec(src))) check(m[1], 'jsx')
}

// dedup
const seen = new Set()
const uniq = hits.filter((h) => { const k = h.file + h.line + h.text; if (seen.has(k)) return false; seen.add(k); return true })

console.log(`Archivos: ${files.length} | hits de alta confianza: ${uniq.length}`)
for (const h of uniq.slice(0, 120)) console.log(`  ${h.file}:${h.line} [${h.kind}/${h.why}]  "${h.text}"`)
if (uniq.length) process.exit(1)
console.log('OK: sin copy español hardcodeado de alta confianza.')
