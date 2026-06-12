/**
 * Lógica pura del nudge del período libre (los 30 días gratis). Reglas
 * anti-spam (spec §6.3): SOLO cuando `source === 'trial'` (un miembro de
 * familia o un pago activo nunca ven el contador — su acceso no depende
 * del período libre), banner una vez por umbral [7, 3, 1] días, copy
 * NEUTRO ("Acceso completo", nunca "Prueba"/"trial" — regla de
 * compliance del spec §7).
 */

export const TRIAL_NUDGE_THRESHOLDS = [7, 3, 1] as const

export function shouldShowFreeAccessBanner(
  snap: { source: string; daysLeft: number | null },
  lastShownThreshold: number | null,
): boolean {
  if (snap.source !== 'trial' || snap.daysLeft == null) return false
  const days = snap.daysLeft
  // Umbral aplicable = el MÁS chico cruzado. Como el array es
  // descendente [7,3,1], es el último match (find devolvería 7 para
  // days=3, pero queremos 3 — el umbral más urgente alcanzado).
  const matched = TRIAL_NUDGE_THRESHOLDS.filter((x) => days <= x)
  const t = matched.at(-1)
  return t !== undefined && t !== lastShownThreshold
}

/** Copy neutro del badge pasivo. NUNCA "Prueba"/"trial". */
export function freeAccessBadgeLabel(daysLeft: number): string {
  return `Acceso completo: ${daysLeft} ${daysLeft === 1 ? 'día restante' : 'días restantes'}`
}
