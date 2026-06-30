import type { DailyBudgetSummary } from '@/features/expenses/daily-budget-engine'
import type { ExpenseAnalyticsSummary } from '@/features/expenses/expense-analytics'
import {
  type CommitmentSummary,
  type ControlMood,
  type MetricDescriptor,
} from '@/features/insights/control-types'
import { clampFinite, isFiniteNumber, safeDiv } from '@/features/insights/signal-guards'
import { currencyFormatter } from '@/utils/money'

export function buildFocusMetrics({
  commitmentSummary,
  expenseAnalytics,
}: {
  commitmentSummary: CommitmentSummary
  expenseAnalytics: ExpenseAnalyticsSummary | null
}): MetricDescriptor[] {
  const metrics: MetricDescriptor[] = []

  // Guard: `share` viene de una división upstream (categoría/total) que puede
  // ser NaN/Infinity si el total es 0 o los montos están corruptos; sin esto el
  // chip mostraría "NaN%" / "∞%". `total` igual: un monto no finito rompe el
  // formateo de moneda. Si cualquiera es inválido, omitimos la métrica.
  if (
    expenseAnalytics?.topCategory &&
    isFiniteNumber(expenseAnalytics.topCategory.share) &&
    isFiniteNumber(expenseAnalytics.topCategory.total)
  ) {
    const sharePct = clampFinite(Math.round(expenseAnalytics.topCategory.share * 100), 0, 100)
    metrics.push({
      helper: `${expenseAnalytics.topCategory.label} suma ${currencyFormatter.format(
        expenseAnalytics.topCategory.total,
      )} en el ciclo.`,
      icon: 'category',
      label: 'Categoria que mas pesa',
      tone: expenseAnalytics.topCategory.share >= 0.35 ? 'warning' : 'default',
      value: `${sharePct}%`,
      wide: true,
    })
  }

  // Guard: un `total` no finito en el gasto recurrente formatearía "NaN"/"∞" en
  // la moneda; omitimos la métrica antes que mostrar un monto errático.
  if (expenseAnalytics?.recurringFocus && isFiniteNumber(expenseAnalytics.recurringFocus.total)) {
    metrics.push({
      helper: `${expenseAnalytics.recurringFocus.label} se repitio ${expenseAnalytics.recurringFocus.count} veces.`,
      icon: 'repeat',
      label: 'Gasto repetido',
      tone: 'warning',
      value: currencyFormatter.format(expenseAnalytics.recurringFocus.total),
    })
  }

  // Guard: el ratio sale de una división (finde / promedio L-V); con promedio 0
  // o data corrupta puede ser Infinity, que pasaría el `>= 1.05` y renderizaría
  // "+∞%". `isFiniteNumber` exige finito; clampeamos el % a un rango sano por si
  // un outlier dispara un porcentaje absurdo.
  if (
    isFiniteNumber(expenseAnalytics?.weekendPremiumRatio) &&
    expenseAnalytics.weekendPremiumRatio >= 1.05
  ) {
    const premiumPct = clampFinite(
      Math.round((expenseAnalytics.weekendPremiumRatio - 1) * 100),
      0,
      999,
    )
    metrics.push({
      helper: 'Compara sabados y domingos contra el promedio de lunes a viernes.',
      icon: 'weekend',
      label: 'Fin de semana',
      tone: expenseAnalytics.weekendPremiumRatio >= 1.25 ? 'warning' : 'default',
      value: `+${premiumPct}%`,
    })
  }

  // Guard: `Infinity > 0` es true y formatearía "∞"; exigimos finito antes de
  // mostrar el monto reservado de compromisos.
  if (isFiniteNumber(commitmentSummary.reservedTotal) && commitmentSummary.reservedTotal > 0) {
    metrics.push({
      helper: `${commitmentSummary.dueSoonCount} cerca · ${commitmentSummary.overdueCount} vencidos`,
      icon: 'account-balance',
      label: 'Compromisos del mes',
      tone:
        commitmentSummary.overdueCount > 0 || commitmentSummary.dueSoonCount > 0
          ? 'warning'
          : 'default',
      value: currencyFormatter.format(commitmentSummary.reservedTotal),
    })
  }

  // Guard: igual que arriba — saldo de deuda no finito → "∞"/"NaN"; omitir.
  if (
    isFiniteNumber(commitmentSummary.debtBalanceTotal) &&
    commitmentSummary.debtBalanceTotal > 0
  ) {
    metrics.push({
      helper: 'Saldo vivo cargado en deudas del hogar.',
      icon: 'lock',
      label: 'Deuda total',
      tone: 'warning',
      value: currencyFormatter.format(commitmentSummary.debtBalanceTotal),
    })
  }

  if (metrics.length === 0 && expenseAnalytics) {
    metrics.push({
      helper: 'No aparece ninguna concentracion fuerte ni aceleracion relevante.',
      icon: 'insights',
      label: 'Ritmo general',
      tone: expenseAnalytics.projectedAvailableAtCycleEnd >= 0 ? 'success' : 'default',
      value:
        expenseAnalytics.projectedAvailableAtCycleEnd >= 0 ? 'Estable' : 'A seguir de cerca',
      wide: true,
    })
  }

  return metrics.slice(0, 4)
}

export function buildControlMood({
  commitmentSummary,
  dailyBudgetSummary,
  expenseAnalytics,
  hasDailyBudgetBase,
  isSalaryPendingConfirmation,
}: {
  commitmentSummary: CommitmentSummary
  dailyBudgetSummary: DailyBudgetSummary
  expenseAnalytics: ExpenseAnalyticsSummary | null
  hasDailyBudgetBase: boolean
  isSalaryPendingConfirmation: boolean
}): ControlMood {
  if (!hasDailyBudgetBase) {
    return {
      detail: 'Falta configurar la base financiera.',
      label: 'Sin base',
      score: 0,
      tone: 'warning',
    }
  }

  let score = 86

  if (isSalaryPendingConfirmation) {
    score -= 18
  }

  if (dailyBudgetSummary.status === 'critical') {
    score -= 10
  }

  if (dailyBudgetSummary.remainingToday < 0) {
    score -= 22
  }

  // Guard: counts no finitos (Infinity) producirían penalizaciones erráticas;
  // sólo restamos cuando son finitos. `Math.min` ya acota el tope.
  if (isFiniteNumber(commitmentSummary.overdueCount)) {
    score -= Math.min(commitmentSummary.overdueCount * 12, 28)
  }
  if (isFiniteNumber(commitmentSummary.dueSoonCount)) {
    score -= Math.min(commitmentSummary.dueSoonCount * 4, 12)
  }

  if (expenseAnalytics?.adjustmentNeededPerDay && expenseAnalytics.adjustmentNeededPerDay > 0) {
    // Guard: `adjustmentNeededPerDay / capBase` puede ser no finito si capBase
    // es 0 (no debería por el Math.max, pero el ajuste puede venir Infinity).
    // safeDiv devuelve null → no penalizamos en vez de poison-ear el score.
    const capBase = Math.max(expenseAnalytics.recommendedDailyCap, 1)
    const ratio = safeDiv(expenseAnalytics.adjustmentNeededPerDay, capBase)
    if (ratio != null) {
      score -= Math.min(20, ratio * 18)
    }
  }

  // Guard: ratio semanal no finito (división por semana previa 0) no debe
  // entrar al score; exigimos finito antes de penalizar.
  if (
    isFiniteNumber(expenseAnalytics?.weeklyDeltaRatio) &&
    expenseAnalytics.weeklyDeltaRatio > 0
  ) {
    score -= Math.min(12, expenseAnalytics.weeklyDeltaRatio * 40)
  }

  if (
    expenseAnalytics?.topCategory &&
    isFiniteNumber(expenseAnalytics.topCategory.share) &&
    expenseAnalytics.topCategory.share >= 0.35
  ) {
    score -= 7
  }

  if (dailyBudgetSummary.zeroSpendStreak >= 2) {
    score += 4
  }

  // Guard final: si pese a todo `score` quedó no finito, lo colapsamos a 0
  // antes de redondear — `Math.round(NaN)` es NaN y se filtraría al render.
  const safeScore = clampFinite(Math.round(score), 0, 100)

  if (safeScore >= 78) {
    return {
      detail: 'Hay aire para decidir sin apuro.',
      label: 'Solido',
      score: safeScore,
      tone: 'success',
    }
  }

  if (safeScore >= 58) {
    return {
      detail: 'Conviene seguir de cerca el ritmo.',
      label: 'Estable',
      score: safeScore,
      tone: 'default',
    }
  }

  return {
    detail: 'El ciclo ya necesita correcciones concretas.',
    label: 'Tenso',
    score: safeScore,
    tone: 'warning',
  }
}
