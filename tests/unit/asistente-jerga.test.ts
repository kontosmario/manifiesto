// Guardarraíl de comprensibilidad del Asistente Financiero.
//
// Auditoría 2026-06-15: el asistente debe entenderse sin saber de finanzas.
// Este test escanea la copy DE USUARIO de las superficies ya saneadas y falla
// si reaparece una palabra de la "lista negra" de jerga. Convierte el estándar
// de voz (docs/superpowers/specs/2026-06-15-asistente-voz-comprensible-design.md)
// en un guardarraíl automático en vez de buena voluntad.
//
// Cómo: lee cada archivo como TEXTO, saca comentarios (// y /* */) y las
// interpolaciones `${...}` de los template literals (para no marcar nombres de
// variables internas como `newCupo`/`forecast`), extrae los strings de display
// y los escanea normalizados (sin acentos, minúsculas).
//
// Alcance: las superficies de copy saneadas (Tandas A/B) MÁS el orquestador de
// señales control-signals.ts (barrido completo 2026-06-15: las 24 señales que
// quedaron tras la curación, en lenguaje sin jerga). Sólo el SYSTEM_PROMPT del
// LLM queda FUERA a propósito (enumera la lista negra como ejemplos a evitar).

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Palabras/frases de jerga que NO deben aparecer en copy de usuario. Forma
// sin acentos y en minúsculas (el scanner normaliza igual).
const BLACKLIST_WORDS = [
  'ratio',
  'momentum',
  'baseline',
  'percentil',
  'aceleracion',
  'dominancia',
  'apalancamiento',
  'drawdown',
  'cupo',
  'sobrante',
  'excedente',
  'margen',
  'sobregiro',
  'holgado',
  'prorrateo',
  'drenaje',
  'filtraciones',
  'volatilidad',
]
const BLACKLIST_PHRASES = [
  'mix 50',
  'deuda diaria',
  'aire acumulado',
  'ritmo ideal',
  'margen real',
  'flexible objetivo',
]

// Archivos de copy ya saneados (Tandas A/B). Rutas relativas al repo root.
const COPY_FILES = [
  'mobile/features/insights/control-signals.ts',
  'mobile/features/insights/control-signals-copy.ts',
  'mobile/features/insights/persona.ts',
  'mobile/features/insights/control-hero-state.ts',
  'mobile/features/insights/control-metric-groups.ts',
  'mobile/features/insights/control-today-actions.ts',
]

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // bloque /* ... */
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ') // línea // ... (evita https://)
}

// Extrae el TEXTO de los string literals ('...', "...", `...`). En los
// template literals saca las interpolaciones ${...} para no escanear
// identificadores internos.
// Un string que NO es copy de usuario sino un identificador interno: kind
// keys kebab/snake ('fijos-ratio', 'super-savings-momentum'), rutas ('/...'),
// o tokens sin letras. La copy de usuario tiene espacios, mayúsculas y
// puntuación; estos no.
function looksLikeIdentifier(s: string): boolean {
  const t = s.trim()
  if (t.length === 0) return true
  if (t.startsWith('/')) return true // rutas
  if (!/\s/.test(t) && t.includes('/')) return true // import paths / module specifiers ('@/features/…')
  if (/^[a-z0-9]+([-_][a-z0-9]+)+$/.test(t)) return true // kebab/snake
  if (!/[a-záéíóúñ]/i.test(t)) return true // sin letras (números, símbolos)
  return false
}

function extractDisplayStrings(src: string): string[] {
  const out: string[] = []
  const re = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const raw = m[0]
    const inner = raw.slice(1, -1)
    const text = raw.startsWith('`') ? inner.replace(/\$\{[^}]*\}/g, ' ') : inner
    if (!looksLikeIdentifier(text)) out.push(text)
  }
  return out
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

interface Violation {
  file: string
  term: string
  snippet: string
}

function scanFile(relPath: string): Violation[] {
  const abs = path.join(process.cwd(), relPath)
  const src = readFileSync(abs, 'utf8')
  const strings = extractDisplayStrings(stripComments(src))
  const violations: Violation[] = []
  for (const str of strings) {
    const norm = normalize(str)
    for (const word of BLACKLIST_WORDS) {
      if (new RegExp(`\\b${word}\\b`).test(norm)) {
        violations.push({ file: relPath, term: word, snippet: str.trim().slice(0, 80) })
      }
    }
    for (const phrase of BLACKLIST_PHRASES) {
      if (norm.includes(phrase)) {
        violations.push({ file: relPath, term: phrase, snippet: str.trim().slice(0, 80) })
      }
    }
  }
  return violations
}

describe('asistente — copy comprensible (sin jerga)', () => {
  for (const file of COPY_FILES) {
    it(`${file} no usa jerga de la lista negra`, () => {
      const violations = scanFile(file)
      const report = violations
        .map((v) => `  · "${v.term}" en: ${v.snippet}`)
        .join('\n')
      expect(violations, `Jerga encontrada en ${file}:\n${report}`).toEqual([])
    })
  }

  it('el scanner detecta jerga (sanity check)', () => {
    // El scanner debe marcar una palabra de la lista negra en un string,
    // pero NO en un comentario ni en una interpolación.
    expect(BLACKLIST_WORDS).toContain('cupo')
    expect(normalize('Aceleración')).toBe('aceleracion')
  })
})
