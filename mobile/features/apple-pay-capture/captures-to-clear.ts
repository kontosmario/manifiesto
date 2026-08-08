import type { ReviewRow } from '@/features/import-review/types'

/**
 * Qué capturas nativas hay que descartar cuando el sheet de revisión se
 * CIERRA SIN CONFIRMAR.
 *
 * El criterio, en tres líneas:
 *  - Saltear una fila es una decisión EXPLÍCITA del usuario: la vio y dijo
 *    "esta no". Su captura se descarta.
 *  - Descartar el sheet sin tocar nada deja todo pendiente: las capturas
 *    sobreviven y se vuelven a ofrecer. Un cierre accidental no puede
 *    costarle un pago al usuario.
 *  - Confirmar tiene su propio camino (`use-confirm-import` + el handler del
 *    host), que además preserva las filas que fallaron al insertar.
 *
 * BORDE CONOCIDO: las devoluciones (monto negativo) nacen en `skip` POR
 * DEFECTO desde `map-captures-to-review-rows`, así que una devolución que el
 * usuario nunca tocó igual se limpia al cerrar. Es deliberado —la vio en el
 * sheet y una devolución no es un gasto—, no un descuido.
 *
 * La intersección con `drainedIds` es la que hace segura la operación: sólo
 * se tocan las capturas de ESTA tanda. `ReviewRow.id` es el id de la captura
 * (ver `map-captures-to-review-rows`), por eso matchean directo.
 */
export function capturesToClear(
  finalRows: readonly ReviewRow[] | undefined,
  drainedIds: readonly string[],
): string[] {
  if (finalRows === undefined || finalRows.length === 0) return []
  const skippedIds = new Set(
    finalRows.filter((row) => row.kind === 'skip').map((row) => row.id),
  )
  if (skippedIds.size === 0) return []
  return drainedIds.filter((id) => skippedIds.has(id))
}
