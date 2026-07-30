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
 * Las superficies claras están TODAS en **L=85% / S=65%**, y las oscuras en
 * **L=24% / S=50%**. Ninguno de los dos es el valor con el que arrancaron.
 *
 * ── Por qué NINGUNO de los dos usa saturación baja ──────────────────────
 * La misma trampa mordió dos veces, una por tema. El oscuro empezó espejando
 * al claro (L=16.5%, S=30%) y las cards se veían GRISES: a esa luminosidad el
 * croma absoluto es mínimo —13 sobre 255— y el ojo discrimina peor el matiz en
 * tonos oscuros. Se subió a L=24%/S=50%: croma 31, y recién ahí el tono se lee.
 *
 * El claro tenía el problema simétrico y tardó más en verse: L=90.5%/S=34% da
 * croma **16**, y con 11 hues repartidos en la rueda eso deja pares que el ojo
 * NO separa. Medido con distancia ponderada en RGB, los cinco peores estaban a
 * ~9-12: servicios/seguros, salud/impuestos, suscripciones/educación,
 * deporte/inversiones, vivienda/cuotas. El owner lo reportó como "colores
 * repetidos en claro". A L=85%/S=65% el croma sube a 50 (3.1×) y el peor par
 * pasa a 30 (3.3×).
 *
 * MORALEJA para quien toque estos números: el matiz NO alcanza para
 * diferenciar. Con 11 categorías hace falta croma, y el croma se pierde en los
 * dos extremos de luminosidad. Si alguna vez hay que aclarar u oscurecer estas
 * superficies, subir la saturación en la misma proporción.
 *
 * Efecto lateral bueno del oscuro: a L=24% la card de categoría queda algo más
 * clara que el `#1A2D21` de las filas que contiene, así que el padre se lee
 * elevado respecto de sus hijos — refuerza la jerarquía en vez de pelearla.
 *
 * ── Contraste ───────────────────────────────────────────────────────────
 * Los 22 pares (11 categorías × 2 temas) verificados a **≥4.5:1**, el umbral
 * AA de TEXTO NORMAL. Es más estricto que lo que pide esta superficie —el
 * nombre va en 19px/900, que califica como texto grande y solo necesitaría
 * 3:1— para que el "N ítems" en 12.5px también pase con margen. Peor par:
 * 5.57:1 en claro (Seguros), 6.22:1 en oscuro (Seguros).
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
  servicios:     { light: { surface: '#C0E5F2', ink: '#225365' }, dark: { surface: '#1F4B5C', ink: '#C9E4ED' } },
  vivienda:      { light: { surface: '#F2D3C0', ink: '#653B22' }, dark: { surface: '#5C351F', ink: '#EDD7C9' } },
  salud:         { light: { surface: '#C0CCF2', ink: '#223465' }, dark: { surface: '#1F2F5C', ink: '#C9D3ED' } },
  deporte:       { light: { surface: '#D3F2C0', ink: '#3D6522' }, dark: { surface: '#375C1F', ink: '#D8EDC9' } },
  seguros:       { light: { surface: '#C0F2E8', ink: '#226558' }, dark: { surface: '#1F5C50', ink: '#C9EDE6' } },
  suscripciones: { light: { surface: '#EBC0F2', ink: '#5C2265' }, dark: { surface: '#541F5C', ink: '#E8C9ED' } },
  educacion:     { light: { surface: '#F2C0DC', ink: '#652248' }, dark: { surface: '#5C1F41', ink: '#EDC9DE' } },
  cuotas:        { light: { surface: '#F2E5C0', ink: '#655322' }, dark: { surface: '#5C4B1F', ink: '#EDE4C9' } },
  impuestos:     { light: { surface: '#CCC0F2', ink: '#362265' }, dark: { surface: '#311F5C', ink: '#D4C9ED' } },
  inversiones:   { light: { surface: '#C0F2C9', ink: '#22652F' }, dark: { surface: '#1F5C2B', ink: '#C9EDD1' } },
  otros:         { light: { surface: '#DCDAD5', ink: '#4E4439' }, dark: { surface: '#433D37', ink: '#E0DBD6' } },
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
