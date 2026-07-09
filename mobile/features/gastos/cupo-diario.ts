// Cupo diario canónico — la porción "libre" del ingreso por día del ciclo.
//
// CRÍTICO: este valor entra como componente de varios queryKeys (el
// gastos_snapshot del screen, el gastos_calendar_summary del controller, y
// el warm-prefetch del tabs layout). Si cada call-site lo calcula con un
// float sin redondear, el drift sub-peso entre esos sitios (o entre dos
// visitas mientras la cache de gastos se asienta por realtime/mutaciones)
// genera una queryKey NUEVA → cache miss → `snapshot.data` undefined → el
// gate cae al skeleton → swap contenido↔skeleton = el "flicker/salto"
// aleatorio que se veía al navegar a Gastos.
//
// Redondear al peso más cercano elimina ese drift fraccional. El server
// usa el cupo sólo para anclar "moods" del calendario, insensible a
// cambios sub-peso. TODOS los sitios DEBEN computar vía este helper para
// que las keys coincidan siempre.
export interface CupoDiarioInput {
  monthlyIncome: number
  fixedExpensesMonthlyTotal: number
  savingsGoal: number
  cycleDays: number
}

export function computeCupoDiario({
  monthlyIncome,
  fixedExpensesMonthlyTotal,
  savingsGoal,
  cycleDays,
}: CupoDiarioInput): number {
  const libre = Math.max(0, monthlyIncome - fixedExpensesMonthlyTotal - savingsGoal)
  return cycleDays > 0 ? Math.round(libre / cycleDays) : 0
}

/** Base de ingreso para el cupo según el modo (review 2026-07-08).
 *  En DINÁMICO el sueldo es 0 por diseño y el presupuesto real del ciclo
 *  es Σ income_events + override (reserva liberada / saldo confirmado);
 *  sin esta base los moods del calendario de Gastos caían al fallback
 *  de promedio y contradecían el cupo que Home/Control anuncian. Es un
 *  agregado ESTABLE ante gastos (solo cambia con ingresos) — apto para
 *  queryKey. AMBOS call-sites (screen + warm-prefetch) DEBEN derivarla
 *  por acá para que las keys coincidan. */
export function resolveCupoIncomeBase(args: {
  incomeMode: 'fixed' | 'dynamic'
  monthlyIncome: number
  cycleIncomeTotal: number
  cycleStartingBalanceOverride: number | null
}): number {
  if (args.incomeMode !== 'dynamic') return args.monthlyIncome
  return args.cycleIncomeTotal + (args.cycleStartingBalanceOverride ?? 0)
}
