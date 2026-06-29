import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { categoryTemplateKey } from '@/features/categories/localize-category-name'

/**
 * Catálogo COMPACTADO de categorías (gasto variable + fijo).
 *
 * Reemplaza al test de granularidad: el owner pidió compactar a categorías
 * GENERALES (variable 30→13+Otros, fijo 19→10+Otros) y revertir el split de
 * Servicios/Seguros + las 12 "curadas".
 *
 * Invariante de 3 capas por categoría (igual que antes, ahora sobre AMBOS
 * scopes): nombre ES default --categoryTemplateKey()--> slug == key i18n;
 * ese slug existe en es/en gastos.json con `default` ancla idéntico en ambos
 * locales y paridad de quickDescriptions; y está mapeado en el ICON_BY_SLUG
 * de su scope a un ícono que EXISTE en el registry generado.
 *
 * Lee los fuentes como TEXTO (el registry hace require() de PNGs que el env
 * 'node' de vitest no transforma).
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const es = JSON.parse(
  readFileSync(join(ROOT, 'mobile/lib/i18n/locales/es/gastos.json'), 'utf8'),
)
const en = JSON.parse(
  readFileSync(join(ROOT, 'mobile/lib/i18n/locales/en/gastos.json'), 'utf8'),
)
const iconMapSrc = readFileSync(
  join(ROOT, 'mobile/components/category/category-icon-map.ts'),
  'utf8',
)
const registrySrc = readFileSync(
  join(ROOT, 'mobile/components/category/category-icon-registry.ts'),
  'utf8',
)

// slug -> iconKey, parseado de cada record (acotado por bloque para no
// mezclar los slugs de expense con los de fixed).
function parseIconBlock(startMarker: string, endMarker: string): Record<string, string> {
  const block = iconMapSrc.slice(
    iconMapSrc.indexOf(startMarker),
    iconMapSrc.indexOf(endMarker),
  )
  const map: Record<string, string> = {}
  for (const m of block.matchAll(/^\s*([a-z0-9_]+):\s*'([^']+)'/gm)) {
    map[m[1]] = m[2]
  }
  return map
}
const EXPENSE_ICON = parseIconBlock('EXPENSE_ICON_BY_SLUG', 'FIXED_ICON_BY_SLUG')
const FIXED_ICON = parseIconBlock('FIXED_ICON_BY_SLUG', 'export type CategoryIconScope')

const REGISTRY_KEYS = new Set(
  [...registrySrc.matchAll(/"([^"]+)":\s*require\(/g)].map((m) => m[1]),
)

// Catálogo final esperado (source-of-truth del diseño compactado).
const EXPECTED_EXPENSE = [
  'mercado',
  'comida_y_salidas',
  'transporte',
  'hogar',
  'salud',
  'cuidado_personal',
  'ropa_y_calzado',
  'tecnologia',
  'ocio',
  'educacion',
  'mascotas',
  'viajes',
  'regalos_y_donaciones',
  'otros',
  // Transferencia: categoría DUAL (también es un kind de ingreso) — un movimiento
  // de transferencia puede ser plata que entra o que sale.
  'transferencia',
]
const EXPECTED_FIXED = [
  'servicios',
  'vivienda',
  'salud',
  'deporte',
  'seguros',
  'suscripciones',
  'educacion',
  'cuotas_y_deudas',
  'impuestos',
  'inversiones',
  'otros',
]

// Slugs que el compactado ELIMINA o renombra (no deben quedar como key i18n).
const GONE_EXPENSE = [
  'alquiler',
  'suscripciones',
  'impuestos',
  'deporte',
  'restaurantes',
  'belleza',
  'ropa',
  'regalos',
  'combustible',
  'delivery',
  'cafeteria',
  'farmacia',
  'peluqueria',
  'taxi',
  'estacionamiento',
  'libros',
  'conciertos',
  'donaciones',
  'hobbies',
  'streaming',
]
const GONE_FIXED = [
  'luz',
  'gas',
  'agua',
  'internet',
  'telefono',
  'seguro_auto',
  'seguro_hogar',
  'prepaga',
  'deudas',
  'gimnasio',
  'cuotas',
]

const SCOPES = [
  {
    scope: 'expense' as const,
    esNode: es.categoryTemplates.expense as Record<string, { default: string; name: string; quickDescriptions: string[] }>,
    enNode: en.categoryTemplates.expense as Record<string, { default: string; name: string; quickDescriptions: string[] }>,
    icon: EXPENSE_ICON,
    expected: EXPECTED_EXPENSE,
    gone: GONE_EXPENSE,
  },
  {
    scope: 'fixed_expense' as const,
    esNode: es.categoryTemplates.fixed_expense as Record<string, { default: string; name: string; quickDescriptions: string[] }>,
    enNode: en.categoryTemplates.fixed_expense as Record<string, { default: string; name: string; quickDescriptions: string[] }>,
    icon: FIXED_ICON,
    expected: EXPECTED_FIXED,
    gone: GONE_FIXED,
  },
]

describe('sanity de parsing', () => {
  it('íconos y registry no vacíos', () => {
    expect(Object.keys(EXPENSE_ICON).length).toBeGreaterThan(0)
    expect(Object.keys(FIXED_ICON).length).toBeGreaterThan(0)
    expect(REGISTRY_KEYS.size).toBeGreaterThanOrEqual(90)
    expect(REGISTRY_KEYS.has('finanzas/venta')).toBe(true)
  })
})

for (const s of SCOPES) {
  describe(`catálogo ${s.scope} — compactado`, () => {
    it('tiene EXACTAMENTE las categorías esperadas', () => {
      expect(Object.keys(s.esNode).sort()).toEqual([...s.expected].sort())
    })

    it.each(s.gone)('"%s" ya NO está en el catálogo', (slug) => {
      expect(s.esNode[slug], `slug "${slug}" debería estar eliminado/renombrado`).toBeUndefined()
    })

    it.each(s.expected)('"%s": key i18n === slug del nombre ES default', (key) => {
      expect(categoryTemplateKey(s.esNode[key].default)).toBe(key)
    })

    it.each(s.expected)('"%s": EN tiene mismo key, default ancla y paridad de quick', (key) => {
      const enNode = s.enNode[key]
      expect(enNode, `falta en EN categoryTemplates.${s.scope}.${key}`).toBeTruthy()
      expect(enNode.default).toBe(s.esNode[key].default)
      expect(enNode.quickDescriptions.length).toBe(s.esNode[key].quickDescriptions.length)
    })

    it.each(s.expected)('"%s": mapeado a un ícono real del registry', (key) => {
      const iconKey = s.icon[key]
      expect(iconKey, `slug "${key}" sin entrada en ICON_BY_SLUG (${s.scope})`).toBeTruthy()
      expect(REGISTRY_KEYS.has(iconKey), `ícono "${iconKey}" no existe en el registry`).toBe(true)
    })
  })
}
