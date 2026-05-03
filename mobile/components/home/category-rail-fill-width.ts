// Tile-width math for the add-expense category rail.
//
// `CategoryHorizontalRail` defaults `tileWidth=60`, sized for fijos
// where the catalog can stretch past 16 entries and horizontal scroll
// is the right pattern. In add-expense the filtered catalog (~12
// items) renders 4 columns × 3 rows, leaving ~96pt of empty
// horizontal whitespace on a 393pt phone — the rail fills less than
// half the available width.
//
// This helper computes a stretched tile width that fills the viewport
// when the grid fits without scrolling, and falls back to the default
// otherwise. Pure function — fully unit-tested without RN renderer.

export interface ComputeFillTileWidthInput {
  categoriesCount: number
  rows: number
  screenWidth: number
  gap: number
  sidePadding: number
  defaultTileWidth: number
  /** Upper bound so 1-cat or iPad cases don't blow up the tile to
   *  absurd sizes (full screen one-tile picker would feel broken). */
  maxTileWidth: number
}

export function computeFillTileWidth(input: ComputeFillTileWidthInput): number {
  const columnsNeeded = Math.max(
    1,
    Math.ceil(input.categoriesCount / Math.max(1, input.rows)),
  )
  const totalGap = (columnsNeeded - 1) * input.gap
  const available = input.screenWidth - input.sidePadding * 2 - totalGap

  // Would the default-sized grid overflow the viewport? Keep the
  // default so the rail scrolls naturally — stretching narrower
  // would just make tiles cramped.
  const defaultGridWidth = columnsNeeded * input.defaultTileWidth
  if (defaultGridWidth > available) {
    return input.defaultTileWidth
  }

  const stretched = Math.floor(available / columnsNeeded)
  // Never below the default, never above the cap.
  return Math.min(input.maxTileWidth, Math.max(input.defaultTileWidth, stretched))
}
