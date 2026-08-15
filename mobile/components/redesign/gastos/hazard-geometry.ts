/**
 * Geometría de la cinta diagonal de peligro (días EXTENDIDOS y FUERA-DE-CICLO).
 *
 * POR QUÉ SVG Y NO UN GRADIENTE. El handoff dibuja la trama con
 * `repeating-linear-gradient(135deg, C 0 5px, T 5px 10px)`. React Native 0.81
 * NO sabe parsearlo: `parseBackgroundImageCSSString` usa la regex
 *
 *     /^(linear|radial)-gradient\(…\)/
 *
 * anclada al principio del string, así que `repeating-linear-gradient(…)` no
 * matchea y el gradiente se descarta EN SILENCIO — sin warning, sin fallback,
 * simplemente no se pinta nada. Emularlo con un `linear-gradient` de stops
 * repetidos tampoco sirve: el parser sólo acepta posiciones en `%` o número,
 * y una posición inválida invalida el gradiente entero. De ahí el SVG, que es
 * el mismo escape que ya usa `GhostOutline` para el molde punteado.
 *
 * LA TRAMA. Las bandas cumplen `x + y = c` (dirección "/", que es la que
 * produce el `135deg` del handoff: el eje del gradiente apunta ↘ y las bandas
 * van perpendiculares) y se repiten cada `HAZARD_STEP` de `c`.
 *
 * EL LOOP. Correr la capa `HAZARD_STEP` en X manda cada banda al lugar exacto
 * de la siguiente, así que la animación cierra sin salto visible. Con
 * cualquier otro corrimiento la cinta pega un tirón en cada vuelta. El valor
 * NO es libre: sale de la separación perpendicular que pide el handoff.
 */

/** Ancho PINTADO de cada banda, perpendicular a ella. Literal del handoff. */
export const HAZARD_BAND = 5
/** Separación PERPENDICULAR entre bandas: 5 pintados + 5 vacíos. */
export const HAZARD_GAP_PERPENDICULAR = 10

/**
 * Paso en `c` (y corrimiento en X del loop).
 *
 * `c = x + y`, así que la distancia perpendicular entre dos bandas separadas
 * por `Δc` es `Δc / √2`. Para que esa distancia sea
 * `HAZARD_GAP_PERPENDICULAR`, el paso tiene que ser `10 · √2 ≈ 14.142`.
 */
export const HAZARD_STEP = HAZARD_GAP_PERPENDICULAR * Math.SQRT2

/** Lado de la capa de bandas. FIJO: cubre la celda más ancha que puede dar la
 *  grilla (~51pt en un Pro Max) más el corrimiento del loop. */
export const HAZARD_W = 96
export const HAZARD_H = 88

/**
 * Las bandas como un ÚNICO `d` de SVG con varios subpaths — un solo nodo
 * nativo en vez de uno por banda. No depende de props: se arma una vez.
 */
export function buildHazardPath(
  width = HAZARD_W,
  height = HAZARD_H,
  step = HAZARD_STEP,
): string {
  const segs: string[] = []
  // El margen de un ancho de banda a cada lado evita que se vea el borde de
  // la primera/última banda al correrse la capa.
  for (let c = -HAZARD_BAND; c <= width + height + HAZARD_BAND; c += step) {
    // De y=0 (x=c) a y=height (x=c-height): dirección (-1, 1) → "/".
    // 3 decimales: `HAZARD_STEP` es irracional (10·√2) y con 2 el redondeo ya
    // corría la separación perpendicular ~0,006pt por banda.
    segs.push(`M${c.toFixed(3)} 0L${(c - height).toFixed(3)} ${height}`)
  }
  return segs.join('')
}
