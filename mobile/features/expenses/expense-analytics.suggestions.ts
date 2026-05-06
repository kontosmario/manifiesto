import type {
  ExpenseAnalyticsCategoryFocus,
  ExpenseAnalyticsRecurringFocus,
  ExpenseAnalyticsSuggestion,
} from '@/features/expenses/expense-analytics.types'
import type { Expense } from '@/features/expenses/use-expenses'
import { currencyFormatter } from '@/utils/money'

export function buildExpenseAnalyticsSuggestions({
  adjustmentNeededPerDay,
  daysRemaining,
  expenses,
  projectedAvailableAtCycleEnd,
  recurringFocus,
  topCategory,
  weeklyDeltaRatio,
  weekendPremiumRatio,
}: {
  adjustmentNeededPerDay: number
  daysRemaining: number
  expenses: Expense[]
  projectedAvailableAtCycleEnd: number
  recurringFocus: ExpenseAnalyticsRecurringFocus | null
  topCategory: ExpenseAnalyticsCategoryFocus | null
  weeklyDeltaRatio: number | null
  weekendPremiumRatio: number | null
}): ExpenseAnalyticsSuggestion[] {
  const suggestions: ExpenseAnalyticsSuggestion[] = []

  if (projectedAvailableAtCycleEnd < 0) {
    const overspend = Math.abs(projectedAvailableAtCycleEnd)
    suggestions.push({
      detail: `Si el ritmo actual sigue, te faltarían ${currencyFormatter.format(
        overspend,
      )}. Baja unos ${currencyFormatter.format(
        overspend / Math.max(daysRemaining, 1),
      )} por día para llegar con aire.`,
      title: 'Riesgo de pasarte antes del próximo cobro',
      tone: 'warning',
    })
  }

  if (adjustmentNeededPerDay > 0) {
    suggestions.push({
      detail: `Para llegar al próximo cobro sin quedarte corto, intentá bajar alrededor de ${currencyFormatter.format(
        adjustmentNeededPerDay,
      )} por día desde mañana.`,
      title: 'Necesitas ajustar el ritmo diario',
      tone: 'warning',
    })
  }

  if (topCategory && topCategory.share >= 0.35) {
    suggestions.push({
      detail: `${topCategory.label} concentra ${Math.round(
        topCategory.share * 100,
      )}% del ciclo. Es la mejor categoría para buscar recortes sin tocar todo el presupuesto.`,
      title: 'La concentración del gasto está muy cargada',
      tone: 'primary',
    })
  }

  if (recurringFocus && recurringFocus.total > Math.max(averageTicketFloor(expenses), 3000)) {
    suggestions.push({
      detail: `"${recurringFocus.label}" apareció ${recurringFocus.count} veces en 60 días y suma ${currencyFormatter.format(
        recurringFocus.total,
      )}. Vale la pena revisar si es suscripción, fee o hábito recurrente.`,
      title: 'Hay un gasto repetido para auditar',
      tone: 'warning',
    })
  }

  if (weekendPremiumRatio !== null && weekendPremiumRatio >= 1.25) {
    suggestions.push({
      detail: `El gasto diario del fin de semana viene ${Math.round(
        (weekendPremiumRatio - 1) * 100,
      )}% arriba del promedio de lunes a viernes.`,
      title: 'Los fines de semana están empujando el total',
      tone: 'primary',
    })
  }

  if (weeklyDeltaRatio !== null && weeklyDeltaRatio >= 0.15) {
    suggestions.push({
      detail: `Los últimos 7 días subieron ${Math.round(
        weeklyDeltaRatio * 100,
      )}% frente a la semana anterior. Revisa qué se aceleró antes de que se consolide.`,
      title: 'El gasto se aceleró esta semana',
      tone: 'warning',
    })
  }

  if (suggestions.length === 0) {
    suggestions.push({
      detail:
        projectedAvailableAtCycleEnd >= 0
          ? `Con el patrón actual cerrarías el ciclo con ${currencyFormatter.format(
              projectedAvailableAtCycleEnd,
            )} disponibles.`
          : 'No hay alertas fuertes todavía, pero conviene seguir de cerca el cierre del ciclo.',
      title: projectedAvailableAtCycleEnd >= 0 ? 'El ritmo viene sano' : 'No hay alertas fuertes todavía',
      tone: projectedAvailableAtCycleEnd >= 0 ? 'success' : 'primary',
    })
  }

  return suggestions.slice(0, 3)
}

function averageTicketFloor(expenses: Expense[]) {
  if (expenses.length === 0) {
    return 0
  }

  const total = expenses.reduce((sum, expense) => sum + expense.price, 0)
  return total / expenses.length
}
