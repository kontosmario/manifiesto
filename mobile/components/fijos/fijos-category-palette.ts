/**
 * Paleta de identificación de categoría para el header colapsable de Fijos.
 *
 * ── Por qué NO se reusa `categoryHues` ──────────────────────────────────
 * Ese sistema está calibrado para BADGES chicos (32-52px): saturación alta
 * para que un tile diminuto se lea. Acá el color pinta una superficie de
 * 335×68, y a ese tamaño los mismos tonos gritan. Además tiene dos problemas
 * que en una lista de 11 categorías se ven enseguida:
 *
 *   · **Se repite.** `matchHueKeyByName` mapea `impuesto → servicios` y
 *     `cuidado personal → belleza`, y lo que no matchea cae a un hash sobre
 *     19 llaves. En la base pasa lo mismo: Salud y Seguros comparten
 *     `#4A7FB8` textual.
 *   · **Choca con la semántica de estado.** El rojo es "vencido" y el verde
 *     de marca es "pagado". Una categoría en esos tonos compite con los chips
 *     que viven adentro de su propia sección.
 *
 * ── Cómo se construyó ───────────────────────────────────────────────────
 * 11 tonos repartidos en la rueda con **22° mínimo** entre vecinos, evitando
 * el rojo puro y reservando el verde solo para Inversiones. `Otros` va en
 * neutro: no tiene identidad propia que comunicar.
 *
 * Las superficies claras están TODAS en L=90.5%, la misma luminosidad que el
 * `#E9EBE0` neutro del kit, con 34% de saturación.
 *
 * ── Por qué el oscuro NO usa los mismos números ─────────────────────────
 * El primer intento espejó el claro (L=16.5%, S=30%) y en oscuro las cards se
 * veían GRISES: a esa luminosidad el croma absoluto es mínimo —el croma medio
 * daba 13 sobre 255— y el ojo, además, discrimina peor el matiz en tonos
 * oscuros. Las oscuras van entonces a **L=24% / S=50%**, que sube el croma
 * medio a 31 (~2.4×) y recién ahí el tono se lee.
 *
 * Efecto lateral bueno: a L=24% la card de categoría queda algo más clara que
 * el `#1A2D21` de las filas que contiene, así que el padre se lee elevado
 * respecto de sus hijos — refuerza la jerarquía en vez de pelearla.
 *
 * ── Contraste ───────────────────────────────────────────────────────────
 * Los 22 pares (11 categorías × 2 temas) verificados a **≥4.5:1**, el umbral
 * AA de TEXTO NORMAL. Es más estricto que lo que pide esta superficie —el
 * nombre va en 19px/900, que califica como texto grande y solo necesitaría
 * 3:1— para que el "N ítems" en 12.5px también pase con margen. Peor par:
 * 5.71:1 en claro (Deporte), 6.22:1 en oscuro (Seguros).
 *
 * OJO al tocar esto: el conteo NO debe llevar `opacity`. Se probó al 78% para
 * bajarle peso y el contraste COMPUESTO cae a 3.63:1 — y `getComputedStyle()
 * .color` no refleja la opacidad, así que medir el color da un falso OK.
 */

export interface FijosCategoryTone {
  /** Fondo de la card de categoría. */
  surface: string
  /** Tinta de nombre, monto y chevron sobre esa superficie. */
  ink: string
}

export interface FijosCategoryPaletteEntry {
  light: FijosCategoryTone
  dark: FijosCategoryTone
}

/** Familias, en el orden del catálogo (`category_templates.sort_order`). */
const PALETTE = {
  servicios:   { light: { surface: '#DFEBEF', ink: '#225365' }, dark: { surface: '#1F4B5C', ink: '#C9E4ED' } },
  vivienda:    { light: { surface: '#EFE5DF', ink: '#653B22' }, dark: { surface: '#5C351F', ink: '#EDD7C9' } },
  salud:       { light: { surface: '#DFE3EF', ink: '#223465' }, dark: { surface: '#1F2F5C', ink: '#C9D3ED' } },
  deporte:     { light: { surface: '#E5EFDF', ink: '#3D6522' }, dark: { surface: '#375C1F', ink: '#D8EDC9' } },
  seguros:     { light: { surface: '#DFEFEC', ink: '#226558' }, dark: { surface: '#1F5C50', ink: '#C9EDE6' } },
  suscripciones: { light: { surface: '#EDDFEF', ink: '#5C2265' }, dark: { surface: '#541F5C', ink: '#E8C9ED' } },
  educacion:   { light: { surface: '#EFDFE8', ink: '#652248' }, dark: { surface: '#5C1F41', ink: '#EDC9DE' } },
  cuotas:      { light: { surface: '#EFEBDF', ink: '#655322' }, dark: { surface: '#5C4B1F', ink: '#EDE4C9' } },
  impuestos:   { light: { surface: '#E3DFEF', ink: '#362265' }, dark: { surface: '#311F5C', ink: '#D4C9ED' } },
  inversiones: { light: { surface: '#DFEFE2', ink: '#22652F' }, dark: { surface: '#1F5C2B', ink: '#C9EDD1' } },
  otros:       { light: { surface: '#E8E7E5', ink: '#4E4439' }, dark: { surface: '#433D37', ink: '#E0DBD6' } },
} as const satisfies Record<string, FijosCategoryPaletteEntry>

type PaletteKey = keyof typeof PALETTE

/** Orden estable para el fallback por hash — no depende de `Object.keys`. */
const PALETTE_KEYS: readonly PaletteKey[] = [
  'servicios', 'vivienda', 'salud', 'deporte', 'seguros', 'suscripciones',
  'educacion', 'cuotas', 'impuestos', 'inversiones', 'otros',
]

/**
 * Matcher por nombre CRUDO. A diferencia del de `category-hues`, acá cada
 * categoría del catálogo cae en su PROPIA llave: impuestos no comparte con
 * servicios, ni seguros con salud.
 */
function matchKey(rawName: string): PaletteKey | null {
  const n = (rawName ?? '').toLowerCase().trim()
  if (!n) return null
  if (/seguro/.test(n)) return 'seguros'
  if (/salud|medic|prepaga|obra social|farm/.test(n)) return 'salud'
  if (/impuesto|afip|arba|monotrib|tasa/.test(n)) return 'impuestos'
  if (/servic|luz|gas|agua|internet|wifi|edenor|metrogas|aysa/.test(n)) return 'servicios'
  if (/vivienda|alquil|hogar|casa|expensa/.test(n)) return 'vivienda'
  if (/deporte|gym|entren|futbol|tenis|running/.test(n)) return 'deporte'
  if (/suscrip|netflix|spotify|youtube|disney|prime/.test(n)) return 'suscripciones'
  if (/educ|curso|colegio|universidad|libro/.test(n)) return 'educacion'
  if (/cuota|deuda|tarjeta|credito|crédito|prestamo|préstamo/.test(n)) return 'cuotas'
  if (/inversi|plazo fijo|bono|accion|acción|cripto|cedear/.test(n)) return 'inversiones'
  if (/otros?/.test(n)) return 'otros'
  return null
}

function hashString(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i++) {
    h = (h << 5) - h + value.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/**
 * Tono de una categoría por su nombre crudo. Las 11 del catálogo caen por
 * matcher; una categoría CUSTOM cae por hash estable sobre las mismas 11 (dos
 * customs pueden compartir familia — es aceptable, lo que no era aceptable era
 * que se repitieran las del catálogo).
 */
export function resolveFijosCategoryTone(
  rawName: string,
  isDark: boolean,
): FijosCategoryTone {
  const key = matchKey(rawName) ?? PALETTE_KEYS[hashString(rawName) % PALETTE_KEYS.length]!
  const entry = PALETTE[key]
  return isDark ? entry.dark : entry.light
}
