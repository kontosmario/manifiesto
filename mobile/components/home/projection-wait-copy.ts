// Copy for the hero card's "Vas a cerrar con" tile while the projection
// is not yet reliable.
//
// The linear close-of-cycle projection swings wildly during the first
// few days of a pay cycle (a single $40 coffee on day 1 extrapolates
// to a $1.2k cycle). The hero hides the number until enough closed
// days exist — the placeholder used to read just "en 2 días" with no
// context, which felt like "the app is broken / loading". This helper
// produces an `Aún calculando · faltan N días` framing so the user
// understands *why* the number is missing and *when* to expect it.

export interface ProjectionWaitCopy {
  /** Top line — explains the state. */
  label: string
  /** Trailing detail with the day count. */
  detail: string
}

export function formatProjectionWaitCopy(
  daysRemaining: number,
): ProjectionWaitCopy {
  const days = Math.max(1, Math.trunc(daysRemaining))
  const detail =
    days === 1 ? 'falta 1 día' : `faltan ${days} días`
  return {
    label: 'Aún calculando',
    detail,
  }
}
