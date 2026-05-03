// Empty-state band for the Fijos panel of the home MonthSummary card.
//
// Mirrors the shape of `TopCategoryFallback` / `computeTopCategoryFallback`
// for the Variables panel: when there's nothing meaningful to show on
// the panel's bottom band (`fijosChip` is null and the all-paid band
// doesn't apply), we still want the slot populated so the two panels
// stay symmetric. The empty-state band invites the user to add their
// first fijo.

export interface NextFixedFallback {
  kind: 'empty'
  primary: string
  secondary: string
}

export interface ComputeNextFixedFallbackInput {
  /** Total active fijos for the family. Zero means the user has never
   *  added one. */
  fixedCount: number
  /** Whether the next-due fijo chip has anything to render. When true
   *  we don't need the fallback — the chip already populates the
   *  band. */
  hasNextFixed: boolean
}

export function computeNextFixedFallback(
  input: ComputeNextFixedFallbackInput,
): NextFixedFallback | null {
  if (input.hasNextFixed) return null
  if (input.fixedCount > 0) return null
  return {
    kind: 'empty',
    primary: 'Cargá tu primer gasto fijo',
    secondary: 'Alquiler, servicios, suscripciones',
  }
}
