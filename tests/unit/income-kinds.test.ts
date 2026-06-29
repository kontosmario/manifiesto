import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  INCOME_KINDS,
  INCOME_KIND_VALUES,
  INCOME_KIND_BY_KEY,
} from '@/features/income/income-kinds'

/**
 * Catálogo de tipos de INGRESO (de 4 → 11). Invariante: cada kind tiene un
 * ícono sticker real, un label i18n no vacío en ES y EN, y el set de kinds
 * coincide exactamente con el union `IncomeEventKind` (guarda de drift entre
 * el tipo, el catálogo y el CHECK de la DB).
 *
 * `income-kinds.ts` es un módulo PURO (solo strings + type-only import del
 * registry) → importable en el env 'node' de vitest. El registry se lee como
 * texto para validar las keys de ícono sin cargar los require(PNG).
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const es = JSON.parse(
  readFileSync(join(ROOT, 'mobile/lib/i18n/locales/es/gastos.json'), 'utf8'),
)
const en = JSON.parse(
  readFileSync(join(ROOT, 'mobile/lib/i18n/locales/en/gastos.json'), 'utf8'),
)
const registrySrc = readFileSync(
  join(ROOT, 'mobile/components/category/category-icon-registry.ts'),
  'utf8',
)
const incomeHookSrc = readFileSync(
  join(ROOT, 'mobile/features/income/use-income-events.ts'),
  'utf8',
)

const REGISTRY_KEYS = new Set(
  [...registrySrc.matchAll(/"([^"]+)":\s*require\(/g)].map((m) => m[1]),
)

// Tipos de ingreso esperados: key DB → label i18n (camelCase) + ícono.
const EXPECTED: Array<{ key: string; label: string; icon: string }> = [
  { key: 'salary_extra', label: 'salaryExtra', icon: 'finanzas/banco' },
  { key: 'freelance', label: 'freelance', icon: 'extra/computadora' },
  { key: 'sale', label: 'sale', icon: 'finanzas/venta' },
  { key: 'aguinaldo', label: 'aguinaldo', icon: 'finanzas/bono' },
  { key: 'investment', label: 'investment', icon: 'finanzas/inversiones' },
  { key: 'refund', label: 'refund', icon: 'finanzas/cajero' },
  { key: 'gift', label: 'gift', icon: 'servicios-general/regalos' },
  { key: 'transfer', label: 'transfer', icon: 'finanzas/transferencia' },
  { key: 'other', label: 'other', icon: 'finanzas/billetera' },
]

describe('catálogo de ingresos — 11 tipos', () => {
  it('INCOME_KINDS tiene exactamente los 11 kinds esperados', () => {
    expect(INCOME_KINDS.map((k) => k.key).sort()).toEqual(
      EXPECTED.map((e) => e.key).sort(),
    )
    expect(INCOME_KIND_VALUES.slice().sort()).toEqual(
      EXPECTED.map((e) => e.key).sort(),
    )
  })

  it.each(EXPECTED)('"$key": ícono y labelKey correctos', ({ key, label, icon }) => {
    const meta = INCOME_KINDS.find((k) => k.key === key)
    expect(meta, `falta el kind ${key}`).toBeTruthy()
    expect(meta!.icon).toBe(icon)
    expect(meta!.labelKey).toBe(`gastos:import.incomeKind.${label}`)
  })

  it.each(EXPECTED)('"$key": ícono "$icon" existe en el registry', ({ icon }) => {
    expect(REGISTRY_KEYS.has(icon), `ícono "${icon}" no existe en el registry`).toBe(true)
  })

  it.each(EXPECTED)('"$key": label i18n no vacío en ES y EN', ({ label }) => {
    expect(typeof es.import.incomeKind[label]).toBe('string')
    expect(es.import.incomeKind[label].length).toBeGreaterThan(0)
    expect(typeof en.import.incomeKind[label]).toBe('string')
    expect(en.import.incomeKind[label].length).toBeGreaterThan(0)
  })

  it.each(EXPECTED)('"$key": tiene emoji y glyph, y está en INCOME_KIND_BY_KEY', ({ key }) => {
    const meta = INCOME_KIND_BY_KEY[key as keyof typeof INCOME_KIND_BY_KEY]
    expect(meta, `INCOME_KIND_BY_KEY no cubre ${key}`).toBeTruthy()
    expect(meta.emoji.length).toBeGreaterThan(0)
    expect(meta.materialIcon.length).toBeGreaterThan(0)
    expect(meta.key).toBe(key)
  })

  it('el union IncomeEventKind coincide con el catálogo', () => {
    const m = incomeHookSrc.match(/export type IncomeEventKind =([^\n]+)/)
    expect(m, 'no se encontró el union IncomeEventKind').toBeTruthy()
    const unionKeys = [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort()
    expect(unionKeys).toEqual(EXPECTED.map((e) => e.key).sort())
  })
})
