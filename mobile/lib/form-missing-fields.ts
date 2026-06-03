/**
 * Builds the helper-line copy that appears under a disabled "Guardar" /
 * "Siguiente" CTA when one or more required fields are unfilled. Used
 * by every add-form (add-expense, add-income, add-fijo, the
 * import-review wizard) so the wording stays identical across surfaces:
 *
 *   ["monto"]                  → "Completá monto para continuar."
 *   ["monto", "categoría"]     → "Completá monto y categoría para continuar."
 *   ["nombre", "monto", "fecha"] → "Completá nombre, monto y fecha para continuar."
 *
 * Caps at 3 visible items so the line never wraps past two lines on a
 * small screen; anything beyond gets an ellipsis tail.
 */
export function formatMissingFields(fields: readonly string[]): string {
  if (fields.length === 0) return ''
  const visible = fields.slice(0, 3)
  let joined: string
  if (visible.length === 1) {
    joined = visible[0]
  } else if (visible.length === 2) {
    joined = `${visible[0]} y ${visible[1]}`
  } else {
    joined = `${visible.slice(0, -1).join(', ')} y ${visible[visible.length - 1]}`
  }
  const tail = fields.length > visible.length ? '…' : ''
  return `Completá ${joined}${tail} para continuar.`
}
