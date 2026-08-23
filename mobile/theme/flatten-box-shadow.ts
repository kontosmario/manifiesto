/**
 * Aplanador de recetas `boxShadow` para el tier de pintura de gama baja
 * (ver `paint-tier.ts`, que decide CUÁNDO se aplica; este módulo es puro
 * y testeable sin nativo).
 *
 * Por qué existe: en Android el costo dominante del vocabulario
 * neumórfico es el RenderThread emitiendo draw commands de sombras
 * difuminadas (medido en un moto g20 / Unisoc T700: "Slow issue draw
 * commands" en ~96% de los frames TANTO en dev como en release — el
 * bottleneck es pintar, no JS). Cada capa difuminada de un `boxShadow`
 * es un blur de GPU cuyo costo escala con el radio; las recetas del
 * handoff llevan 2-3 capas por superficie.
 *
 * La regla del tier plano, determinística:
 *   1. Se conservan TODAS las capas con blur 0 (anillos de selección,
 *      líneas de luz `inset 0 1px 0 …`): son baratas y cargan identidad.
 *   2. De las capas difuminadas sobrevive SOLO la primera (la key shadow
 *      oscura que da la profundidad), con el blur capado a MAX_BLUR_PX.
 *   3. El orden relativo original se preserva (el orden de pintado
 *      importa).
 */

/**
 * Cap de blur del tier plano. Empezó en 16px (fase 1); bajado a 12px en
 * la fase 2 (2026-08-20) — el costo del blur escala con el radio y a
 * 12px la profundidad todavía se lee sobre el fill sólido.
 */
const MAX_BLUR_PX = 12

/** Divide una receta multi-sombra por comas de nivel cero (fuera de `rgba(...)`). */
function splitLayers(recipe: string): string[] {
  const layers: string[] = []
  let depth = 0
  let current = ''
  for (const ch of recipe) {
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) {
      layers.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) layers.push(current.trim())
  return layers
}

/** Tokeniza una capa por espacios de nivel cero (rgba(...) queda entera). */
function tokenizeLayer(layer: string): string[] {
  const tokens: string[] = []
  let depth = 0
  let current = ''
  for (const ch of layer) {
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    if (ch === ' ' && depth === 0) {
      if (current) tokens.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current) tokens.push(current)
  return tokens
}

const LENGTH_TOKEN = /^-?\d*\.?\d+(px)?$/

/** Blur de una capa (3er length: [inset] offX offY [blur [spread]] color). */
function layerBlur(tokens: string[]): number {
  const lengths = tokens.filter((t) => LENGTH_TOKEN.test(t))
  const blur = lengths[2]
  return blur ? Math.abs(parseFloat(blur)) : 0
}

/** Reemplaza el blur (3er length) de la capa por el valor capado. */
function capLayerBlur(tokens: string[]): string {
  let lengthIndex = 0
  const rebuilt = tokens.map((t) => {
    if (!LENGTH_TOKEN.test(t)) return t
    lengthIndex += 1
    if (lengthIndex === 3 && Math.abs(parseFloat(t)) > MAX_BLUR_PX) {
      return `${MAX_BLUR_PX}px`
    }
    return t
  })
  return rebuilt.join(' ')
}

/**
 * Aplana una receta `boxShadow`: capas blur-0 intactas + la primera capa
 * difuminada con blur ≤ MAX_BLUR_PX. Orden original preservado.
 */
export function flattenBoxShadow(recipe: string): string {
  const layers = splitLayers(recipe)
  let blurredKept = false
  const kept: string[] = []
  for (const layer of layers) {
    const tokens = tokenizeLayer(layer)
    if (layerBlur(tokens) === 0) {
      kept.push(layer)
      continue
    }
    if (!blurredKept) {
      blurredKept = true
      kept.push(capLayerBlur(tokens))
    }
  }
  return kept.join(', ')
}

/**
 * ¿El string es una receta de sombra? Sombras arrancan con
 * `[inset] <len> <len> …`; los gradientes contienen `gradient(` y los
 * colores/labels no tienen el par de offsets inicial.
 */
export function looksLikeBoxShadow(value: string): boolean {
  if (value.includes('gradient(')) return false
  return /^(inset\s+)?-?\d*\.?\d+(px)?\s+-?\d*\.?\d+(px)?(\s|,|$)/.test(value.trim())
}

/**
 * Camina un objeto de spec/tokens y aplana toda receta de sombra que
 * encuentre (strings que pasan `looksLikeBoxShadow`). Con `enabled`
 * false devuelve el MISMO objeto (identidad, cero costo) — el flag lo
 * decide `paint-tier.ts` a partir del hardware.
 */
export function flattenShadowRecipes<T>(value: T, enabled = true): T {
  if (!enabled) return value
  return walk(value) as T
}

function walk(value: unknown): unknown {
  if (typeof value === 'string') {
    return looksLikeBoxShadow(value) ? flattenBoxShadow(value) : value
  }
  if (Array.isArray(value)) return value.map(walk)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = walk(v)
    }
    return out
  }
  return value
}
