import type { DailyBudgetSummary } from '@/features/expenses/daily-budget-engine'
import type { ExpenseAnalyticsSummary } from '@/features/expenses/expense-analytics'
import { type CommitmentSummary, type ControlAction } from '@/features/insights/control-types'
import { currencyFormatter } from '@/utils/money'

export function buildTodayActions({
  commitmentSummary,
  dailyBudgetSummary,
  expenseAnalytics,
  flexibleDelta,
  flexibleTargetAmount,
  hasDailyBudgetBase,
  isSalaryPendingConfirmation,
  savingsGoal,
  savingsGoalPercent,
  savingsRemaining,
  targetFlexiblePercent,
  variableSpentInCurrentCycle,
}: {
  commitmentSummary: CommitmentSummary
  dailyBudgetSummary: DailyBudgetSummary
  expenseAnalytics: ExpenseAnalyticsSummary | null
  flexibleDelta: number
  flexibleTargetAmount: number
  hasDailyBudgetBase: boolean
  isSalaryPendingConfirmation: boolean
  savingsGoal: number
  savingsGoalPercent: number
  savingsRemaining: number
  targetFlexiblePercent: number
  variableSpentInCurrentCycle: number
}): ControlAction[] {
  if (!hasDailyBudgetBase) {
    return [
      {
        detail: 'Sin ingreso, ahorro meta y dia de cobro no hay una referencia confiable para decidir.',
        title: 'Completa primero la configuracion financiera',
        tone: 'warning',
      },
    ]
  }

  const actions: ControlAction[] = []

  if (isSalaryPendingConfirmation) {
    actions.push({
      detail: 'Hacerlo ahora evita que el ciclo nuevo quede mezclado con el anterior.',
      title: 'Confirma el cobro antes de seguir cargando',
      tone: 'warning',
    })
  }

  if (dailyBudgetSummary.remainingToday < 0) {
    actions.push({
      detail: `Si frenas aqui, manana abres con ${currencyFormatter.format(
        dailyBudgetSummary.projectedTomorrowOpening,
      )}.`,
      title: 'Hoy conviene cortar el gasto variable',
      tone: 'warning',
    })
  } else {
    actions.push({
      detail: `Tu tope real para lo que queda del dia es ${currencyFormatter.format(
        dailyBudgetSummary.remainingToday,
      )}.`,
      title: 'Toma como referencia lo que todavia queda hoy',
      tone: 'primary',
    })
  }

  if (commitmentSummary.overdueCount > 0) {
    actions.push({
      detail: `Hay ${commitmentSummary.overdueCount} caso${
        commitmentSummary.overdueCount === 1 ? '' : 's'
      } vencido${commitmentSummary.overdueCount === 1 ? '' : 's'} y eso ya esta empujando el ciclo.`,
      title: 'Paga primero los fijos vencidos',
      tone: 'warning',
    })
  } else if (commitmentSummary.dueSoonCount > 0 && commitmentSummary.reservedTotal > 0) {
    actions.push({
      detail: `Apartar ${currencyFormatter.format(
        commitmentSummary.reservedTotal,
      )} te evita quedar corto cuando venzan los proximos pagos fijos.`,
      title: 'Aparta plata para los pagos fijos que vienen',
      tone: 'primary',
    })
  }

  if (flexibleTargetAmount > 0 && flexibleDelta > 0) {
    actions.push({
      detail: `Tu plan (mitad para los pagos fijos, ${targetFlexiblePercent}% para el dia a dia y ${savingsGoalPercent}% para ahorrar) te dejaba ${currencyFormatter.format(
        flexibleTargetAmount,
      )} para el dia a dia, y ya llevas ${currencyFormatter.format(variableSpentInCurrentCycle)}.`,
      title: 'Ya te pasaste de lo del dia a dia',
      tone: 'warning',
    })
  } else if (expenseAnalytics?.adjustmentNeededPerDay && expenseAnalytics.adjustmentNeededPerDay > 0) {
    actions.push({
      detail: `Desde manana intenta bajar alrededor de ${currencyFormatter.format(
        expenseAnalytics.adjustmentNeededPerDay,
      )} por dia.`,
      title: 'Conviene gastar un poco menos por dia',
      tone: 'warning',
    })
  } else if (dailyBudgetSummary.zeroSpendStreak > 0) {
    actions.push({
      detail: `Ya llevas ${dailyBudgetSummary.zeroSpendStreak} dia${
        dailyBudgetSummary.zeroSpendStreak === 1 ? '' : 's'
      } seguido${dailyBudgetSummary.zeroSpendStreak === 1 ? '' : 's'} sin gastar.`,
      title: 'Cuida la plata que ya ahorraste',
      tone: 'success',
    })
  } else if (flexibleTargetAmount > 0 && savingsRemaining > 0) {
    actions.push({
      detail: `Todavia te quedan ${currencyFormatter.format(
        Math.max(0, flexibleTargetAmount - variableSpentInCurrentCycle),
      )} para gastos del dia a dia este mes.`,
      title: 'Vas bien con tu plan del mes',
      tone: 'success',
    })
  } else if (savingsGoal > 0 && savingsRemaining > 0) {
    actions.push({
      detail: `Todavia quedan ${currencyFormatter.format(
        savingsRemaining,
      )} del objetivo de ahorro sin tocar.`,
      title: 'Evita comer ahorro si no hace falta',
      tone: 'success',
    })
  }

  return actions.slice(0, 3)
}
