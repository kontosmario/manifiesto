import type { DailyBudgetSummary } from '@/features/expenses/daily-budget-engine'
import type { ExpenseAnalyticsSummary } from '@/features/expenses/expense-analytics'
import {
  formatRemainingDays,
  type CommitmentSummary,
  type ControlHeroState,
} from '@/features/insights/control-types'
import { currencyFormatter } from '@/utils/money'

export function buildHeroState({
  commitmentSummary,
  dailyBudgetSummary,
  expenseAnalytics,
  hasDailyBudgetBase,
  isSalaryPendingConfirmation,
  remainingUntilPayday,
}: {
  commitmentSummary: CommitmentSummary
  dailyBudgetSummary: DailyBudgetSummary
  expenseAnalytics: ExpenseAnalyticsSummary | null
  hasDailyBudgetBase: boolean
  isSalaryPendingConfirmation: boolean
  remainingUntilPayday: number
}): ControlHeroState {
  if (!hasDailyBudgetBase) {
    return {
      detail: 'Defini ingreso, ahorro y dia de cobro para que la app pueda guiarte.',
      eyebrow: 'Base faltante',
      title: 'Falta el marco financiero',
      variant: 'accent',
    }
  }

  if (isSalaryPendingConfirmation) {
    return {
      detail: 'Confirma tu ultimo cobro y pongo al dia tus numeros del mes.',
      eyebrow: 'Nuevo mes',
      title: 'Confirma tu cobro para ponerte al dia',
      variant: 'accent',
    }
  }

  if (dailyBudgetSummary.remainingToday < 0) {
    return {
      detail: `Hoy gastaste mas de lo que tenias para hoy, y faltan ${formatRemainingDays(
        remainingUntilPayday,
      )} para el proximo cobro.`,
      eyebrow: 'Ojo hoy',
      title: 'Hoy gastaste de mas',
      variant: 'accent',
    }
  }

  if (commitmentSummary.overdueCount > 0) {
    return {
      detail: `Tenes ${commitmentSummary.overdueCount} pago${
        commitmentSummary.overdueCount === 1 ? '' : 's'
      } fijo${commitmentSummary.overdueCount === 1 ? '' : 's'} vencido${
        commitmentSummary.overdueCount === 1 ? '' : 's'
      } y ${currencyFormatter.format(commitmentSummary.reservedTotal)} todavia sin pagar.`,
      eyebrow: 'Ojo del mes',
      title: 'Tenes pagos fijos vencidos',
      variant: 'accent',
    }
  }

  if (expenseAnalytics?.adjustmentNeededPerDay && expenseAnalytics.adjustmentNeededPerDay > 0) {
    return {
      detail: `Bajando como ${currencyFormatter.format(
        expenseAnalytics.adjustmentNeededPerDay,
      )} por dia, llegas bien a fin de mes.`,
      eyebrow: 'Ajuste chico',
      title: 'Con un ajuste chico llegas bien',
      variant: 'accent',
    }
  }

  if (commitmentSummary.dueSoonCount > 0 && commitmentSummary.reservedTotal > 0) {
    return {
      detail: `Se vienen ${commitmentSummary.dueSoonCount} pago${
        commitmentSummary.dueSoonCount === 1 ? '' : 's'
      } fijo${commitmentSummary.dueSoonCount === 1 ? '' : 's'} y conviene apartar ${currencyFormatter.format(
        commitmentSummary.reservedTotal,
      )} para no quedar corto a fin de mes.`,
      eyebrow: 'Proximos dias',
      title: 'Se vienen gastos fijos: conviene apartar plata',
      variant: 'hero',
    }
  }

  if (dailyBudgetSummary.zeroSpendStreak >= 2) {
    return {
      detail: `Llevas ${dailyBudgetSummary.zeroSpendStreak} dias seguidos sin gastar — asi te queda mas plata para el resto del mes.`,
      eyebrow: 'Buena noticia',
      title: 'Venis sumando plata sin gastar',
      variant: 'hero',
    }
  }

  return {
    detail: `Quedan ${formatRemainingDays(
      remainingUntilPayday,
    )} para el cobro y hoy todavia estas dentro del rango previsto.`,
    eyebrow: 'Lectura rapida',
    title: 'El ciclo viene controlado',
    variant: 'hero',
  }
}
