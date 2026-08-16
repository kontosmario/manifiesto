/**
 * Ancho de tile para los rieles que viven DENTRO del sheet de importación.
 *
 * `railTileWidth` (el compartido) resta los 40pt de padding del `Screen` y
 * reparte el resto en 4 columnas exactas. Acá el contenedor no es un
 * `Screen` sino el `ModalCard`, que tiene 22pt de padding por lado: con la
 * fórmula del Screen los 4 tiles llenaban el ancho justo y NO asomaba el
 * quinto, así que el riel no anunciaba que había más categorías. Sobre un
 * catálogo de ~30, ese peek es la diferencia entre "hay 4" y "hay más".
 *
 * Por eso el divisor es 4.35 y no 4: entran cuatro tiles completos y un
 * borde del quinto.
 */
export const MODAL_HORIZONTAL_PADDING = 22
const RAIL_INNER_PADDING = 8
const TILE_GAP = 8
const VISIBLE_COLUMNS = 4.35

export function modalRailTileWidth(windowWidth: number): number {
  const available =
    windowWidth -
    MODAL_HORIZONTAL_PADDING * 2 -
    RAIL_INNER_PADDING -
    TILE_GAP * 4
  return Math.max(64, Math.floor(available / VISIBLE_COLUMNS))
}
