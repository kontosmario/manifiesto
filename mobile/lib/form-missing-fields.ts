/**
 * Builds the helper-line copy that appears under a disabled "Guardar" /
 * "Siguiente" CTA when one or more required fields are unfilled. Used
 * by every add-form (add-expense, add-income, add-fijo, the
 * import-review wizard) so the wording stays identical across surfaces:
 *
 *   ["monto"]                  → "Completa monto para continuar."
 *   ["monto", "categoría"]     → "Completa monto y categoría para continuar."
 *   ["nombre", "monto", "fecha"] → "Completa nombre, monto y fecha para continuar."
 *
 * Caps at 3 visible items so the line never wraps past two lines on a
 * small screen; anything beyond gets an ellipsis tail. El wrapper y el
 * joiner se localizan (common:form.*); los nombres de campo llegan ya
 * localizados desde cada controller.
 */
import i18n from '@/lib/i18n'
export function formatMissingFields(fields: readonly string[]): string {
  if (fields.length === 0) return ''
  const visible = fields.slice(0, 3)
  let joined: string
  if (visible.length === 1) {
    joined = visible[0]
  } else if (visible.length === 2) {
    joined = i18n.t('common:form.join2', { a: visible[0], b: visible[1] })
  } else {
    joined = i18n.t('common:form.joinN', {
      list: visible.slice(0, -1).join(', '),
      last: visible[visible.length - 1],
    })
  }
  const tail = fields.length > visible.length ? '…' : ''
  return i18n.t('common:form.missing', { fields: `${joined}${tail}` })
}
