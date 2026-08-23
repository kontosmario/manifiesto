// Claves del nudge de presupuesto diario. Módulo PURO (cero imports de RN)
// para que el test de regresión del incidente 2026-08-23 pueda importarlo
// sin arrastrar la cadena de módulos nativos.

export const LEGACY_CHECKIN_DATA_KEY = 'daily-budget-checkin'
export const THRESHOLD_NOTIFICATION_KEY = 'daily-budget-threshold'

/**
 * Clave de dedup del nudge del umbral en persistent-kv. SEPARADOR '.' —
 * NUNCA ':' — porque expo-secure-store valida las claves contra
 * /^[\\w.-]+$/ y persistent-kv se traga la excepción de una clave inválida
 * (lectura Y escritura fallan en silencio). Con la clave vieja
 * 'daily-budget-threshold:<fam>:<fecha>' el dedup NUNCA persistió en
 * native: cada re-corrida del efecto (cualquier refetch de gastos o del
 * dashboard) agendaba OTRA "Cierra tu día" — el spam del incidente
 * 2026-08-23. No hay datos que migrar: la clave vieja jamás se escribió.
 */
export function buildThresholdNudgeKey(familyId: string, dateKey: string): string {
  return `${THRESHOLD_NOTIFICATION_KEY}.${familyId}.${dateKey}`
}
