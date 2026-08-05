/**
 * Intermedios del ciclo VIGENTE en el shape que consume
 * `computeAddIncomeImpact` — más la ventana del ciclo para clasificar la fecha
 * del ingreso.
 *
 * Por qué existe: `useHomeMetrics` ya compone esta cuenta, pero devuelve el
 * RESULTADO (`hero.availableToday` / `hero.dailyBudget`), no los inputs. El
 * paso 2 del alta necesita los inputs porque tiene que correr la misma fórmula
 * DOS veces —con y sin el ingreso— y cualquier otra forma de sumarlo daría un
 * número distinto del que el usuario ve al volver al Home.
 *
 * Las tres correspondencias que NO pueden derivar de `use-home-metrics`:
 *  1. `commitmentPressure` es `fixedExpensesMonthlyTotal` (la presión CRUDA),
 *     no `effectiveCommitmentReserved` (que va prorrateado y sólo alimenta
 *     `effectiveReservedFixed`).
 *  2. `hasCycleOverride` es override de saldo O modo dinámico: en dinámico el
 *     cupo se reparte sobre los días restantes por el mismo camino.
 *  3. La ventana del ciclo es la de ACCOUNTING (`monthlyAccounting`), la misma
 *     con la que se suman los `income_events` del ciclo. Usar la del cobro
 *     (`payCycle`) haría que el aviso de "fuera del ciclo" hablara de una
 *     ventana distinta de la que efectivamente cuenta la plata.
 */
import { useMemo } from 'react'
import type { CycleDisponibleInputs } from '@/features/family/cycle-disponible'
import { useCycleIncomeEventsTotal } from '@/features/income/use-income-events'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { formatLocalDateKey } from '@/utils/pay-cycle'

export interface IncomeCycleInputs {
  cycle: CycleDisponibleInputs
  /** Primer día del ciclo (INCLUSIVE). */
  cycleStart: Date
  /**
   * Primer día del ciclo SIGUIENTE (EXCLUSIVE). La ventana es semi-abierta
   * `[start, end)`: así la filtra la query de ingresos del ciclo
   * (`.gte(start).lt(end)`) y así la clasifica `classifyCyclePlacement`.
   */
  cycleEnd: Date
  /**
   * `false` mientras hidratan las queries del ciclo. Cubre el dashboard Y la
   * suma de ingresos del ciclo: son dos queries distintas y el `home_snapshot`
   * no siembra la segunda, así que mirar sólo el dashboard dejaba pasar un
   * `cycleExtraIncome` en 0 como si fuera el valor real.
   */
  isReady: boolean
}

export function useIncomeCycleInputs(familyId: string): IncomeCycleInputs {
  const dashboard = useFamilyDashboard(familyId)
  const cycleStart = dashboard.monthlyAccounting.start
  const cycleEnd = dashboard.monthlyAccounting.end
  // MISMA ventana y MISMA query que `use-home-metrics`: si se pidiera con otro
  // rango, el "antes" del paso 2 no coincidiría con el saldo del Home.
  const cycleIncomeQuery = useCycleIncomeEventsTotal(
    familyId,
    formatLocalDateKey(cycleStart),
    formatLocalDateKey(cycleEnd),
  )
  const cycleExtraIncome = cycleIncomeQuery.data ?? 0

  const cycle = useMemo<CycleDisponibleInputs>(
    () => ({
      effectiveCycleIncome: dashboard.effectiveCycleIncome,
      effectiveCycleDays: dashboard.effectiveCycleDays,
      commitmentPressure: dashboard.fixedExpensesMonthlyTotal,
      effectiveSavingsGoal: dashboard.savingsGoal,
      totalAvailable: dashboard.totalAvailable,
      cycleExtraIncome,
      // Los fijos PENDIENTES vuelven al saldo (todavía no salieron de la
      // cuenta); el cupo sí los reserva. Piso 0 + redondeo como en el Home.
      effectiveReservedFixed: Math.max(
        0,
        Math.round(dashboard.effectiveCommitmentReserved),
      ),
      hasCycleOverride:
        dashboard.cycleStartingBalanceOverride !== null ||
        dashboard.incomeMode === 'dynamic',
    }),
    [
      dashboard.effectiveCycleIncome,
      dashboard.effectiveCycleDays,
      dashboard.fixedExpensesMonthlyTotal,
      dashboard.savingsGoal,
      dashboard.totalAvailable,
      cycleExtraIncome,
      dashboard.effectiveCommitmentReserved,
      dashboard.cycleStartingBalanceOverride,
      dashboard.incomeMode,
    ],
  )

  return {
    cycle,
    cycleStart,
    cycleEnd,
    isReady: !dashboard.isLoadingDashboard && !cycleIncomeQuery.isLoading,
  }
}
