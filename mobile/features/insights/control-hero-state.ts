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
      detail: 'Confirmar el cobro reinicia el ciclo y vuelve consistentes las proyecciones.',
      eyebrow: 'Nuevo ciclo',
      title: 'Confirma el cobro para reordenar el control',
      variant: 'accent',
    }
  }

  if (dailyBudgetSummary.remainingToday < 0) {
    return {
      detail: `Ya consumiste parte del margen de manana y faltan ${formatRemainingDays(
        remainingUntilPayday,
      )} para el proximo cobro.`,
      eyebrow: 'Atencion hoy',
      title: 'Hoy ya entraste en deuda diaria',
      variant: 'accent',
    }
  }

  if (commitmentSummary.overdueCount > 0) {
    return {
      detail: `Tenes ${commitmentSummary.overdueCount} compromiso${
        commitmentSummary.overdueCount === 1 ? '' : 's'
      } vencido${commitmentSummary.overdueCount === 1 ? '' : 's'} y ${currencyFormatter.format(
        commitmentSummary.reservedTotal,
      )} todavia por cubrir.`,
      eyebrow: 'Atencion del mes',
      title: 'Los compromisos fijos necesitan orden ya',
      variant: 'accent',
    }
  }

  if (expenseAnalytics?.adjustmentNeededPerDay && expenseAnalytics.adjustmentNeededPerDay > 0) {
    return {
      detail: `Con un ajuste cercano a ${currencyFormatter.format(
        expenseAnalytics.adjustmentNeededPerDay,
      )} por dia todavia podes llegar prolijo al cierre.`,
      eyebrow: 'Ajuste sugerido',
      title: 'El resto del mes necesita una correccion simple',
      variant: 'accent',
    }
  }

  if (commitmentSummary.dueSoonCount > 0 && commitmentSummary.reservedTotal > 0) {
    return {
      detail: `Hay ${commitmentSummary.dueSoonCount} compromiso${
        commitmentSummary.dueSoonCount === 1 ? '' : 's'
      } cerca y conviene separar ${currencyFormatter.format(
        commitmentSummary.reservedTotal,
      )} para no tensar el cierre.`,
      eyebrow: 'Proximos dias',
      title: 'Vienen gastos fijos que ya conviene anticipar',
      variant: 'hero',
    }
  }

  if (dailyBudgetSummary.zeroSpendStreak >= 2) {
    return {
      detail: `Llevas ${dailyBudgetSummary.zeroSpendStreak} dias seguidos construyendo aire para el resto del mes.`,
      eyebrow: 'Lectura rapida',
      title: 'Vienes acumulando margen real',
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
