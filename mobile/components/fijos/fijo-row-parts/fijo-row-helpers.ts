/**
 * Helpers compartidos del fijo-row + sub-componentes. Sin Intl en el
 * bundle por compat con Reanimated worklets (memory:
 * `feedback_reanimated_worklet_globals`). Solo se llaman en el render
 * thread (JS thread), así que técnicamente Intl funcionaría — pero
 * mantener consistencia y velocidad usando mini arrays.
 */

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Convierte `YYYY-MM-01` (cuotaMonth de FijoItem) a un label
 * humano en español: "junio", "julio", etc. Si el year es distinto
 * al actual, agrega el year para evitar ambigüedad: "junio 2027".
 */
export function monthOfLabel(yyyyMm01: string): string {
  const parts = yyyyMm01.split('-')
  if (parts.length < 2) return yyyyMm01
  const year = parseInt(parts[0]!, 10)
  const monthIdx = parseInt(parts[1]!, 10) - 1
  if (Number.isNaN(year) || Number.isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) {
    return yyyyMm01
  }
  const currentYear = new Date().getFullYear()
  const name = MONTH_NAMES[monthIdx]!
  return year === currentYear ? name : `${name} ${year}`
}

/**
 * Copy humano para el trend chip. Convierte un delta numérico ("+12%")
 * a una oración con verbo ("Subió 12% desde el último pago") para que
 * sea legible por usuarios que no leen porcentajes con fluidez. Pivot
 * a "Mantiene" para deltas chicos (< 1%) para no alarmar sobre ruido
 * de redondeo.
 */
export function trendCopyLabel(deltaPct: number): string {
  if (Math.abs(deltaPct) < 1) return 'Mantiene el precio'
  const sign = deltaPct > 0 ? 'Subió' : 'Bajó'
  return `${sign} ${Math.abs(deltaPct)}% desde el último pago`
}

export function trendCopySubLabel(history: number[]): string {
  // Si hay 3+ puntos, mostramos contexto del rango histórico: "del último
  // pago vs el primero registrado". Solo 2 puntos = "vs el anterior".
  if (history.length >= 3) {
    const oldest = history[0] ?? 0
    const current = history[history.length - 1] ?? 0
    if (oldest > 0 && current > 0) {
      const totalDelta = Math.round(((current - oldest) / oldest) * 100)
      if (Math.abs(totalDelta) >= 1) {
        return `${totalDelta > 0 ? '+' : ''}${totalDelta}% en ${history.length} pagos`
      }
    }
  }
  return `Comparación con el pago anterior`
}

export function trendCopyColor(deltaPct: number, isDark: boolean): string {
  if (Math.abs(deltaPct) < 1) return isDark ? '#D5D5D5' : '#5A5A5A'
  if (deltaPct > 0) return isDark ? '#F2A78C' : '#B84014'
  return isDark ? '#A6EF8F' : '#297811'
}

/**
 * Convierte un `next_due_on` ('YYYY-MM-DD') a texto humano:
 *   - Mismo mes y año + futuro: "Vence el 10 de junio (en 5 días)"
 *   - Mismo mes y año + hoy:    "Vence HOY (10 de junio)"
 *   - Mismo mes y año + pasado: "Venció el 10 de junio (hace 5 días)"
 *   - Año distinto: agrega año.
 * Null/inválido devuelve "Sin fecha programada".
 */
export function nextDueLabel(nextDueOn: string | null): string {
  if (!nextDueOn) return 'Sin fecha programada'
  const parts = nextDueOn.split('-')
  if (parts.length < 3) return nextDueOn
  const year = parseInt(parts[0]!, 10)
  const monthIdx = parseInt(parts[1]!, 10) - 1
  const day = parseInt(parts[2]!, 10)
  if (Number.isNaN(year) || Number.isNaN(monthIdx) || Number.isNaN(day)) {
    return nextDueOn
  }
  const monthName = MONTH_NAMES[monthIdx] ?? ''
  const currentYear = new Date().getFullYear()
  const yearSuffix = year === currentYear ? '' : ` de ${year}`
  const today = new Date()
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const dueUtc = Date.UTC(year, monthIdx, day)
  const diffDays = Math.round((dueUtc - todayUtc) / 86_400_000)
  if (diffDays === 0) {
    return `Vence HOY (${day} de ${monthName}${yearSuffix})`
  }
  if (diffDays > 0) {
    return `Vence el ${day} de ${monthName}${yearSuffix} (en ${diffDays} ${diffDays === 1 ? 'día' : 'días'})`
  }
  const absDays = Math.abs(diffDays)
  return `Venció el ${day} de ${monthName}${yearSuffix} (hace ${absDays} ${absDays === 1 ? 'día' : 'días'})`
}

export function frequencyLabel(f: string): string {
  switch (f) {
    case 'weekly':
      return 'Semanal'
    case 'biweekly':
      return 'Quincenal'
    case 'monthly':
      return 'Mensual'
    case 'quarterly':
      return 'Trimestral'
    case 'semiannual':
      return 'Semestral'
    case 'annual':
      return 'Anual'
    default:
      return f
  }
}

export function hexAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized.split('').map((c) => c + c).join('')
      : normalized
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
