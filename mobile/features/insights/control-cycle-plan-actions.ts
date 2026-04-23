import type { DailyBudgetSummary } from '@/features/expenses/daily-budget-engine'
import type { ExpenseAnalyticsSummary } from '@/features/expenses/expense-analytics'
import { type CommitmentSummary, type ControlAction } from '@/features/insights/control-types'
import { currencyFormatter } from '@/utils/money'

export function buildCyclePlanActions({
  commitmentSummary,
  dailyBudgetSummary,
  expenseAnalytics,
  hasDailyBudgetBase,
}: {
  commitmentSummary: CommitmentSummary
  dailyBudgetSummary: DailyBudgetSummary
  expenseAnalytics: ExpenseAnalyticsSummary | null
  hasDailyBudgetBase: boolean
}): ControlAction[] {
  if (!hasDailyBudgetBase) {
    return [
      {
        detail: 'Una base financiera clara es lo que convierte el historial en decisiones utiles.',
        title: 'Activa primero el marco de control',
        tone: 'warning',
      },
    ]
  }

  const actions: ControlAction[] = []

  if (expenseAnalytics?.adjustmentNeededPerDay && expenseAnalytics.adjustmentNeededPerDay > 0) {
    actions.push({
      detail: `El ajuste sugerido es de ${currencyFormatter.format(
        expenseAnalytics.adjustmentNeededPerDay,
      )} por dia durante lo que queda del ciclo.`,
      title: 'Corrige el ritmo diario antes de tocar todo el presupuesto',
      tone: 'warning',
    })
  } else if (expenseAnalytics?.recommendedDailyCap && expenseAnalytics.recommendedDailyCap > 0) {
    actions.push({
      detail: `El tope simple para sostener el cierre es ${currencyFormatter.format(
        expenseAnalytics.recommendedDailyCap,
      )} por dia.`,
      title: 'Usa un cap diario en vez de revisar cada gasto aislado',
      tone: 'primary',
    })
  }

  if (expenseAnalytics?.topCategory && expenseAnalytics.topCategory.share >= 0.25) {
    actions.push({
      detail: `${expenseAnalytics.topCategory.label} ya explica ${Math.round(
        expenseAnalytics.topCategory.share * 100,
      )}% del ciclo.`,
      title: `Empieza por ${expenseAnalytics.topCategory.label}`,
      tone: 'primary',
    })
  }

  if (expenseAnalytics?.recurringFocus) {
    actions.push({
      detail: `"${expenseAnalytics.recurringFocus.label}" aparecio ${expenseAnalytics.recurringFocus.count} veces y suma ${currencyFormatter.format(
        expenseAnalytics.recurringFocus.total,
      )}.`,
      title: 'Audita el gasto repetido antes que el gasto chico',
      tone: 'warning',
    })
  }

  if (commitmentSummary.reservedTotal > 0) {
    actions.push({
      detail: `Hay ${currencyFormatter.format(
        commitmentSummary.reservedTotal,
      )} comprometidos entre fijos, cuotas y deuda para este ciclo.`,
      title: 'Separa primero lo comprometido y despues mira el resto',
      tone: commitmentSummary.overdueCount > 0 ? 'warning' : 'primary',
    })
  }

  if (
    expenseAnalytics?.weekendPremiumRatio != null &&
    expenseAnalytics.weekendPremiumRatio >= 1.15
  ) {
    actions.push({
      detail: `Los fines de semana vienen ${Math.round(
        (expenseAnalytics.weekendPremiumRatio - 1) * 100,
      )}% arriba del promedio de lunes a viernes.`,
      title: 'Pon un limite especifico al fin de semana',
      tone: 'primary',
    })
  }

  if (actions.length === 0) {
    actions.push({
      detail: `Hoy todavia te quedan ${currencyFormatter.format(
        dailyBudgetSummary.remainingToday,
      )} y la proyeccion no marca alertas fuertes.`,
      title: 'Manten el ritmo actual y segui registrando',
      tone: 'success',
    })
  }

  return actions.slice(0, 4)
}
