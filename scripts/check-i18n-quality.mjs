#!/usr/bin/env node
/**
 * Chequeos de CALIDAD de traducción (determinísticos):
 *  (a) Paridad de variables {{...}} entre es y en por key (una traducción que
 *      pierde/renombra un {{monto}} es un bug: el dato no aparece).
 *  (b) Español sospechoso en valores EN: diacríticos á/é/í/ó/ú/ñ o ¿/¡ →
 *      probablemente quedó sin traducir.
 *
 * Uso: node scripts/check-i18n-quality.mjs   (exit 1 si hay hallazgos)
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const ES = join(ROOT, 'mobile/lib/i18n/locales/es')
const EN = join(ROOT, 'mobile/lib/i18n/locales/en')

function flat(o, p = '', acc = {}) {
  for (const k in o) {
    const v = o[k]
    const key = p ? `${p}.${k}` : k
    if (Array.isArray(v)) v.forEach((it, i) => { if (typeof it === 'string') acc[`${key}[${i}]`] = it })
    else if (v && typeof v === 'object') flat(v, key, acc)
    else if (typeof v === 'string') acc[key] = v
  }
  return acc
}
const vars = (s) => new Set([...s.matchAll(/\{\{\s*([\w]+)/g)].map((m) => m[1]))
// permite loanwords comunes en inglés
const ALLOWED_EN = /café|résumé|naïve|Manifiesto/i
const SPANISH = /[áéíóúñ¿¡]/

const namespaces = readdirSync(ES).filter((f) => f.endsWith('.json'))
const varMismatches = []
const spanishInEn = []

for (const f of namespaces) {
  const es = flat(JSON.parse(readFileSync(join(ES, f), 'utf8')))
  const en = flat(JSON.parse(readFileSync(join(EN, f), 'utf8')))
  for (const key in es) {
    const ev = es[key], nv = en[key]
    if (nv == null) continue
    const a = vars(ev), b = vars(nv)
    const miss = [...a].filter((x) => !b.has(x))
    const extra = [...b].filter((x) => !a.has(x))
    if (miss.length || extra.length) {
      varMismatches.push(`${f} ${key}  es{${[...a]}} en{${[...b]}}`)
    }
    // `categoryTemplates.*.default` es el nombre ES de match (anclaje no
    // destructivo): es INTENCIONAL que sea español en ambos locales.
    const isMatchAnchor = /^categoryTemplates\..+\.default$/.test(key)
    const cleaned = nv.replace(ALLOWED_EN, '')
    if (!isMatchAnchor && SPANISH.test(cleaned)) {
      spanishInEn.push(`${f} ${key}  →  "${nv}"`)
    }
  }
}

console.log(`Namespaces: ${namespaces.length}`)
console.log(`(a) Mismatch de variables {{}} es↔en: ${varMismatches.length}`)
varMismatches.slice(0, 60).forEach((x) => console.log('   ' + x))
console.log(`(b) Español sospechoso en EN: ${spanishInEn.length}`)
spanishInEn.slice(0, 80).forEach((x) => console.log('   ' + x))

if (varMismatches.length || spanishInEn.length) process.exit(1)
console.log('OK: variables consistentes y sin español residual en EN.')
